package com.konolivepro.mobile

import android.Manifest
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
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
    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private var fcmToken: String? = null

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { showHomeIfAuthenticated() }

    private val locationPermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val allowed = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        Toast.makeText(this, if (allowed) "Localisation autorisée" else "Localisation non autorisée", Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        api = SupabaseApi(this)
        CallNotifications.createChannels(this)
        handleIncomingIntent(intent)
        showHomeIfAuthenticated()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        val raw = intent?.getStringExtra(CallNotifications.EXTRA_CALL_JSON) ?: return
        startActivity(Intent(this, IncomingCallActivity::class.java).putExtra(CallNotifications.EXTRA_CALL_JSON, raw))
    }

    private fun showHomeIfAuthenticated() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (session.accessToken.isNullOrBlank()) renderLogin() else renderHome()
    }

    private fun baseLayout(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(24), dp(32), dp(24), dp(24))
        setBackgroundColor(Color.rgb(12, 15, 22))
    }

    private fun renderLogin() {
        root = baseLayout()
        val title = TextView(this).apply {
            text = "Konolive"
            textSize = 34f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }
        root.addView(title, LinearLayout.LayoutParams(-1, -2))
        root.addView(TextView(this).apply {
            text = "Connexion sécurisée à votre espace"
            textSize = 16f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(28))
        }, LinearLayout.LayoutParams(-1, -2))

        val identifier = EditText(this).apply {
            hint = "E-mail"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setSingleLine(true)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
        }
        val password = EditText(this).apply {
            hint = "Mot de passe"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
        }
        root.addView(identifier, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(12) })
        root.addView(password, LinearLayout.LayoutParams(-1, dp(56)).apply { bottomMargin = dp(18) })
        val login = Button(this).apply { text = "Se connecter" }
        root.addView(login, LinearLayout.LayoutParams(-1, dp(56)))
        status = TextView(this).apply { setTextColor(Color.LTGRAY); setPadding(0, dp(18), 0, 0) }
        root.addView(status, LinearLayout.LayoutParams(-1, -2))
        login.setOnClickListener {
            val user = identifier.text.toString().trim()
            val pass = password.text.toString()
            if (user.isBlank() || pass.isBlank()) { status.text = "Saisissez votre e-mail et votre mot de passe."; return@setOnClickListener }
            login.isEnabled = false
            status.text = "Connexion…"
            lifecycleScope.launch {
                runCatching { api.login(user, pass) }
                    .onSuccess { registerPushAndShowHome() }
                    .onFailure { login.isEnabled = true; status.text = "Connexion impossible : ${it.message ?: "réessayez"}" }
            }
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun renderHome() {
        root = baseLayout()
        root.addView(TextView(this).apply {
            text = "Konolive"
            textSize = 30f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        }, LinearLayout.LayoutParams(-1, -2))
        status = TextView(this).apply {
            text = "Vous êtes connecté. Les appels entrants peuvent être reçus en arrière-plan."
            textSize = 16f
            setTextColor(Color.LTGRAY)
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, dp(24))
        }
        root.addView(status, LinearLayout.LayoutParams(-1, -2))
        val location = Button(this).apply { text = "Autoriser la localisation" }
        root.addView(location, LinearLayout.LayoutParams(-1, dp(52)).apply { bottomMargin = dp(12) })
        location.setOnClickListener {
            locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
        val logout = Button(this).apply { text = "Se déconnecter" }
        root.addView(logout, LinearLayout.LayoutParams(-1, dp(52)))
        logout.setOnClickListener { lifecycleScope.launch { runCatching { api.revokeDevice() }; session.clear(); renderLogin() } }
        setContentView(ScrollView(this).apply { addView(root) })
        registerPushAndSync()
    }

    private fun registerPushAndShowHome() {
        renderHome()
        registerPushAndSync()
    }

    private fun registerPushAndSync() {
        if (session.accessToken.isNullOrBlank()) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            fcmToken = token
            lifecycleScope.launch { runCatching { api.registerDevice(token, BuildConfig.VERSION_NAME) } }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
