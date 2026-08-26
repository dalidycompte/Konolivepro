package com.konolivepro.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    private lateinit var api: SupabaseApi
    private lateinit var statusText: TextView

    private val notificationsPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) Toast.makeText(this, "Les notifications sont nécessaires pour recevoir les appels.", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        api = SupabaseApi(this)
        CallNotifications.createChannels(this)
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        if (session.accessToken.isNullOrBlank()) showLogin() else showDashboard()
    }

    private fun showLogin() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 64, 48, 40)
        }
        val title = TextView(this).apply { text = "Konolive Coach"; textSize = 28f; setTextColor(0xff16202a.toInt()) }
        val subtitle = TextView(this).apply { text = "Recevez les appels de vérification même lorsque l’application est fermée."; textSize = 15f }
        val identifier = EditText(this).apply { hint = "Nom d’utilisateur ou e-mail"; inputType = 33 }
        val password = EditText(this).apply { hint = "Mot de passe"; inputType = 129 }
        val login = Button(this).apply { text = "Se connecter" }
        val message = TextView(this)
        root.addView(title); root.addView(subtitle); root.addView(identifier); root.addView(password); root.addView(login); root.addView(message)
        setContentView(root)

        login.setOnClickListener {
            login.isEnabled = false
            message.text = "Connexion…"
            lifecycleScope.launch {
                try {
                    api.login(identifier.text.toString().trim(), password.text.toString())
                    registerPushToken()
                    showDashboard()
                } catch (error: Exception) {
                    message.text = "Connexion impossible : ${error.message ?: "serveur indisponible"}"
                    login.isEnabled = true
                }
            }
        }
    }

    private fun showDashboard() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 54, 36, 36)
        }
        val title = TextView(this).apply { text = "Tableau de bord"; textSize = 27f; setTextColor(0xff16202a.toInt()) }
        val coach = TextView(this).apply { text = "Coach Mobile\n${session.username ?: "Compte connecté"}"; textSize = 16f }
        statusText = TextView(this).apply { text = "● Disponible pour recevoir des appels"; textSize = 16f; setTextColor(0xff138a4b.toInt()) }
        val battery = Button(this).apply { text = "Configurer la batterie" }
        battery.setOnClickListener {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        val logout = Button(this).apply { text = "Se déconnecter" }
        logout.setOnClickListener {
            lifecycleScope.launch { runCatching { api.revokeDevice() }; session.clear(); showLogin() }
        }
        root.addView(title); root.addView(coach); root.addView(statusText); root.addView(battery); root.addView(logout)
        setContentView(root)
        registerPushToken()
    }

    private fun registerPushToken() {
        val userId = session.userId ?: return
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            lifecycleScope.launch {
                runCatching { api.registerDevice(task.result, BuildConfig.VERSION_NAME) }
            }
        }
    }
}
