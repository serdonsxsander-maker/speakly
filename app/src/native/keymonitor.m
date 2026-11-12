#import <Foundation/Foundation.h>
#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

typedef struct {
    const char* name;
    CGEventFlags deviceMask;
    CGEventFlags genericMask;
    CGKeyCode keyCode;
    bool isModifier;
} WatchedKey;

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        // Fast single-paste mode: ./keymonitor --paste
        if (argc > 1 && strcmp(argv[1], "--paste") == 0) {
            NSWorkspace *ws = [NSWorkspace sharedWorkspace];
            NSRunningApplication *frontApp = [ws frontmostApplication];
            pid_t pid = frontApp ? [frontApp processIdentifier] : 0;

            CGEventSourceRef src = CGEventSourceCreate(kCGEventSourceStateHIDSystemState);
            CGKeyCode vKeyCode = 9; // 'v'
            CGEventRef down = CGEventCreateKeyboardEvent(src, vKeyCode, true);
            CGEventSetFlags(down, kCGEventFlagMaskCommand);
            CGEventRef up = CGEventCreateKeyboardEvent(src, vKeyCode, false);
            CGEventSetFlags(up, kCGEventFlagMaskCommand);

            // Post directly to the frontmost application process (e.g. Chrome, Notes, Slack)
            if (pid > 0) {
                CGEventPostToPid(pid, down);
            }
            CGEventPost(kCGHIDEventTap, down);
            usleep(35000);
            if (pid > 0) {
                CGEventPostToPid(pid, up);
            }
            CGEventPost(kCGHIDEventTap, up);

            if (down) CFRelease(down);
            if (up) CFRelease(up);
            if (src) CFRelease(src);
            return 0;
        }

        setvbuf(stdout, NULL, _IONBF, 0);
        printf("READY\n");

        WatchedKey watched[] = {
            {"right_cmd",   0x00000010, kCGEventFlagMaskCommand,   54, true},
            {"left_cmd",    0x00000008, kCGEventFlagMaskCommand,   55, true},
            {"right_alt",   0x00000040, kCGEventFlagMaskAlternate, 61, true},
            {"left_alt",    0x00000020, kCGEventFlagMaskAlternate, 58, true},
            {"right_ctrl",  0x00002000, kCGEventFlagMaskControl,   62, true},
            {"left_ctrl",   0x00000001, kCGEventFlagMaskControl,   59, true},
            {"right_shift", 0x00000004, kCGEventFlagMaskShift,     60, true},
            {"left_shift",  0x00000002, kCGEventFlagMaskShift,     56, true},
            {"escape",      0,          0,                         53, false},
            {"f5",          0,          0,                         96, false},
            {"f6",          0,          0,                         97, false},
            {"f7",          0,          0,                         98, false},
            {"f8",          0,          0,                        100, false},
            {"f9",          0,          0,                        101, false},
            {"f10",         0,          0,                        109, false},
            {"f11",         0,          0,                        103, false},
            {"f12",         0,          0,                        111, false}
        };

        int numKeys = sizeof(watched) / sizeof(watched[0]);
        bool prevState[32] = {false};
        bool prevOtherKey = false;

        while (1) {
            CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState) |
                                 CGEventSourceFlagsState(kCGEventSourceStateHIDSystemState);

            for (int i = 0; i < numKeys; i++) {
                bool isDown = false;
                if (watched[i].isModifier) {
                    if ((flags & watched[i].deviceMask) != 0) {
                        isDown = true;
                    } else if ((flags & watched[i].genericMask) != 0 && (flags & 0x0000207F) == 0) {
                        isDown = true;
                    }
                } else {
                    isDown = CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, watched[i].keyCode) ||
                             CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, watched[i].keyCode);
                }

                if (isDown != prevState[i]) {
                    prevState[i] = isDown;
                    printf("%s:%s\n", isDown ? "DOWN" : "UP", watched[i].name);
                }
            }

            bool anyOtherDown = false;
            for (int k = 0; k <= 50; k++) {
                if (CGEventSourceKeyState(kCGEventSourceStateCombinedSessionState, (CGKeyCode)k) ||
                    CGEventSourceKeyState(kCGEventSourceStateHIDSystemState, (CGKeyCode)k)) {
                    anyOtherDown = true;
                    break;
                }
            }
            if (anyOtherDown != prevOtherKey) {
                prevOtherKey = anyOtherDown;
                if (anyOtherDown) {
                    printf("DOWN:other_key\n");
                }
            }

            usleep(8000); // 8ms poll (~125 Hz)
        }
    }
    return 0;
}
