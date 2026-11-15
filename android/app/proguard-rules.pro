# Capacitor bridge and every plugin that is resolved reflectively.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.capacitorjs.plugins.** { *; }
-keep class app.capgo.plugin.health.** { *; }

# Firebase / Google services (Auth, Firestore, Messaging) and Google sign-in.
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-keep class com.google.android.gms.auth.** { *; }
-keep class com.google.android.gms.common.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**

# Firebase Authentication supports Facebook/Apple/Twitter providers we do not
# use; their SDKs are not installed, so R8 must not require their classes.
-dontwarn com.facebook.**
-dontwarn com.twitter.**
-dontwarn com.apple.**

# Keep annotations, signatures and JavaScript bridge methods used by reflection.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
