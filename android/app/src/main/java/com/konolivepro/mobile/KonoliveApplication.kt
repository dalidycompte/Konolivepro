package com.konolivepro.mobile

import android.app.Application
import com.google.firebase.FirebaseApp

class KonoliveApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FirebaseApp.initializeApp(this)
    }
}
