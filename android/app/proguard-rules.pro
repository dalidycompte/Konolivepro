# WebRTC and Firebase keep rules are supplied by their dependencies.
# Keep the FCM service entry point and call activities discoverable by Android.
-keep class com.konolivepro.mobile.KonoliveMessagingService { *; }
-keep class com.konolivepro.mobile.IncomingCallActivity { *; }
-keep class com.konolivepro.mobile.CallActivity { *; }
