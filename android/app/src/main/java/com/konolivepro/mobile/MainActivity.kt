package com.konolivepro.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    private lateinit var api: SupabaseApi
    private lateinit var pageBody: LinearLayout
    private lateinit var pageTitle: TextView
    private var currentPage = Page.HOME
    private var requests: List<ApplicantRequest> = emptyList()
    private var notifications: List<ApplicantNotification> = emptyList()

    private enum class Page { HOME, REQUESTS, NEW_REQUEST, NOTIFICATIONS, MESSAGES, SETTINGS }

    private val notificationsPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (!granted) Toast.makeText(this, "Activez les notifications pour recevoir les appels.", Toast.LENGTH_LONG).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        api = SupabaseApi(this)
        CallNotifications.createChannels(this)
        requestNotificationPermission()
        if (session.accessToken.isNullOrBlank()) showLogin() else showApp()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    private fun baseRoot(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setBackgroundColor(AppStyle.background)
        setPadding(AppStyle.dp(this@MainActivity, 18), AppStyle.dp(this@MainActivity, 18), AppStyle.dp(this@MainActivity, 18), 0)
    }

    private fun showLogin() {
        val root = baseRoot().apply { gravity = Gravity.CENTER_HORIZONTAL }
        val header = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }
        val logo = TextView(this).apply {
            text = "K"
            textSize = 29f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
            background = AppStyle.button(this@MainActivity, "").background
            setBackgroundColor(AppStyle.primary)
        }
        header.addView(logo, LinearLayout.LayoutParams(AppStyle.dp(this, 64), AppStyle.dp(this, 64)))
        header.addView(AppStyle.title(this, "Konolive"), LinearLayout.LayoutParams(-2, -2).apply { topMargin = AppStyle.dp(this@MainActivity, 12) })
        header.addView(AppStyle.text(this, "Plateforme de vérification d’identité", 13f, AppStyle.muted))
        root.addView(header, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 22) })

        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 22), AppStyle.dp(this@MainActivity, 22), AppStyle.dp(this@MainActivity, 22), AppStyle.dp(this@MainActivity, 20)) }
        AppStyle.raised(card, 18)
        card.addView(AppStyle.text(this, "Se connecter", 20f, AppStyle.text), LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 16) })
        val identifier = EditText(this).apply { hint = "Entrez votre identifiant"; setTextColor(AppStyle.text); setHintTextColor(AppStyle.muted); inputType = 33; setSingleLine(true) }
        val password = EditText(this).apply { hint = "Entrez votre mot de passe"; setTextColor(AppStyle.text); setHintTextColor(AppStyle.muted); inputType = 129; setSingleLine(true) }
        card.addView(labelledField("Nom d’utilisateur ou e-mail", identifier))
        card.addView(labelledField("Mot de passe", password))
        val forgot = AppStyle.text(this, "Mot de passe oublié ?", 12f, AppStyle.primary).apply { gravity = Gravity.END; setPadding(0, AppStyle.dp(this@MainActivity, 4), 0, AppStyle.dp(this@MainActivity, 12)) }
        card.addView(forgot)
        val login = AppStyle.button(this, "Se connecter")
        card.addView(login, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 50)))
        val status = AppStyle.text(this, "", 12f, AppStyle.danger).apply { setPadding(0, AppStyle.dp(this@MainActivity, 10), 0, 0) }
        card.addView(status)
        card.addView(AppStyle.text(this, "Nouveau coach mobile ?  Créer un compte", 13f, AppStyle.primary).apply { gravity = Gravity.CENTER; setPadding(0, AppStyle.dp(this@MainActivity, 15), 0, 0) })
        root.addView(card, LinearLayout.LayoutParams(-1, -2))
        root.addView(AppStyle.text(this, "En vous connectant, vous acceptez nos Conditions d’utilisation et notre Politique de confidentialité.", 11f, AppStyle.muted).apply { gravity = Gravity.CENTER; setPadding(AppStyle.dp(this@MainActivity, 15), AppStyle.dp(this@MainActivity, 17), AppStyle.dp(this@MainActivity, 15), 0) })
        setContentView(root)

        login.setOnClickListener {
            login.isEnabled = false
            status.setTextColor(AppStyle.muted); status.text = "Connexion…"
            lifecycleScope.launch {
                try {
                    api.login(identifier.text.toString().trim(), password.text.toString())
                    session.username = api.getProfileUsername() ?: identifier.text.toString().trim()
                    registerPushToken()
                    showApp()
                } catch (error: Exception) {
                    status.setTextColor(AppStyle.danger)
                    status.text = "Connexion impossible. Vérifiez vos identifiants ou votre connexion."
                    login.isEnabled = true
                }
            }
        }
    }

    private fun labelledField(label: String, field: EditText): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        addView(AppStyle.text(this@MainActivity, label, 12f, AppStyle.text))
        addView(field, LinearLayout.LayoutParams(-1, AppStyle.dp(this@MainActivity, 52)).apply { topMargin = AppStyle.dp(this@MainActivity, 4); bottomMargin = AppStyle.dp(this@MainActivity, 9) })
    }

    private fun showApp() {
        val root = baseRoot()
        val header = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL }
        val logo = TextView(this).apply { text = "K"; textSize = 21f; gravity = Gravity.CENTER; setTextColor(Color.WHITE); typeface = android.graphics.Typeface.DEFAULT_BOLD; setBackgroundColor(AppStyle.primary) }
        header.addView(logo, LinearLayout.LayoutParams(AppStyle.dp(this, 44), AppStyle.dp(this, 44)))
        val brand = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 12), 0, 0, 0) }
        brand.addView(AppStyle.text(this, "Konolive", 18f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD })
        brand.addView(AppStyle.text(this, "Coach Mobile", 11f, AppStyle.muted))
        header.addView(brand, LinearLayout.LayoutParams(0, -2, 1f))
        val profile = AppStyle.text(this, (session.username ?: "C").take(1).uppercase(Locale.getDefault()), 16f, Color.WHITE).apply { gravity = Gravity.CENTER; setBackgroundColor(AppStyle.primaryDark) }
        header.addView(profile, LinearLayout.LayoutParams(AppStyle.dp(this, 38), AppStyle.dp(this, 38)))
        root.addView(header, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 54)).apply { bottomMargin = AppStyle.dp(this@MainActivity, 8) })

        pageTitle = AppStyle.title(this, "Tableau de bord")
        root.addView(pageTitle, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 8) })
        val scroll = ScrollView(this)
        pageBody = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(0, 0, 0, AppStyle.dp(this@MainActivity, 18)) }
        scroll.addView(pageBody)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(bottomNavigation(), LinearLayout.LayoutParams(-1, AppStyle.dp(this, 64)))
        setContentView(root)
        loadData()
        renderPage()
    }

    private fun bottomNavigation(): HorizontalScrollView = HorizontalScrollView(this).apply {
        isHorizontalScrollBarEnabled = false
        val nav = LinearLayout(this@MainActivity).apply { gravity = Gravity.CENTER; setPadding(AppStyle.dp(this@MainActivity, 3), 0, AppStyle.dp(this@MainActivity, 3), 0) }
        listOf(Page.HOME to "Accueil", Page.REQUESTS to "Demandes", Page.NOTIFICATIONS to "Alertes", Page.MESSAGES to "Messages", Page.SETTINGS to "Paramètres").forEach { (page, label) ->
            val item = AppStyle.text(this@MainActivity, label, 11f, if (page == currentPage) AppStyle.primary else AppStyle.muted).apply { gravity = Gravity.CENTER; setPadding(AppStyle.dp(this@MainActivity, 9), 0, AppStyle.dp(this@MainActivity, 9), 0); setOnClickListener { currentPage = page; renderPage() } }
            nav.addView(item, LinearLayout.LayoutParams(AppStyle.dp(this@MainActivity, 76), -1))
        }
        addView(nav)
    }

    private fun renderPage() {
        if (!::pageBody.isInitialized) return
        pageBody.removeAllViews()
        pageTitle.text = when (currentPage) {
            Page.HOME -> "Tableau de bord"
            Page.REQUESTS -> "Mes demandes"
            Page.NEW_REQUEST -> "Nouvelle demande"
            Page.NOTIFICATIONS -> "Notifications"
            Page.MESSAGES -> "Messages"
            Page.SETTINGS -> "Paramètres"
        }
        when (currentPage) {
            Page.HOME -> renderHome()
            Page.REQUESTS -> renderRequests()
            Page.NEW_REQUEST -> renderNewRequest()
            Page.NOTIFICATIONS -> renderNotifications()
            Page.MESSAGES -> renderMessages()
            Page.SETTINGS -> renderSettings()
        }
    }

    private fun renderHome() {
        val welcome = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        welcome.addView(AppStyle.text(this, "Bienvenue, ${session.username ?: "Coach"}", 18f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD })
        welcome.addView(AppStyle.text(this, "Voici un aperçu de vos vérifications.", 13f, AppStyle.muted))
        pageBody.addView(welcome, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 14) })

        val available = LinearLayout(this).apply { gravity = Gravity.CENTER_VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 15), AppStyle.dp(this@MainActivity, 13), AppStyle.dp(this@MainActivity, 15), AppStyle.dp(this@MainActivity, 13)) }
        AppStyle.raised(available, 14)
        available.addView(AppStyle.text(this, "●  Disponible pour recevoir les appels", 13f, AppStyle.success), LinearLayout.LayoutParams(0, -2, 1f))
        available.addView(AppStyle.button(this, "Nouvelle demande"), LinearLayout.LayoutParams(AppStyle.dp(this, 155), AppStyle.dp(this, 44)).apply { topMargin = 0 })
        (available.getChildAt(1) as View).setOnClickListener { currentPage = Page.NEW_REQUEST; renderPage() }
        pageBody.addView(available, LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 16) })

        val today = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())
        val todayRequests = requests.filter { it.createdAt.startsWith(today) }
        val statValues = listOf("Demandes aujourd’hui" to todayRequests.size.toString(), "En attente" to todayRequests.count { it.status == "pending" }.toString(), "Acceptées" to todayRequests.count { it.status == "accepted" }.toString(), "Rejetées" to todayRequests.count { it.status == "rejected" }.toString())
        val stats = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        statValues.chunked(2).forEach { rowValues ->
            val row = LinearLayout(this@MainActivity).apply { weightSum = 2f }
            rowValues.forEach { (label, value) -> row.addView(statCard(label, value), LinearLayout.LayoutParams(0, AppStyle.dp(this@MainActivity, 88), 1f).apply { marginEnd = AppStyle.dp(this@MainActivity, 6); bottomMargin = AppStyle.dp(this@MainActivity, 8) }) }
            stats.addView(row)
        }
        pageBody.addView(stats)
        pageBody.addView(sectionHeader("Demandes récentes", "Voir tout") { currentPage = Page.REQUESTS; renderPage() })
        if (requests.isEmpty()) pageBody.addView(emptyCard("Aucune demande pour l’instant.")) else requests.take(5).forEach { pageBody.addView(requestRow(it)) }
        pageBody.addView(sectionHeader("Notifications récentes", "Voir tout") { currentPage = Page.NOTIFICATIONS; renderPage() })
        if (notifications.isEmpty()) pageBody.addView(emptyCard("Aucune notification pour l’instant.")) else notifications.take(3).forEach { pageBody.addView(notificationRow(it)) }
    }

    private fun statCard(label: String, value: String): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 12), AppStyle.dp(this@MainActivity, 10), AppStyle.dp(this@MainActivity, 12), AppStyle.dp(this@MainActivity, 8)); AppStyle.raised(this, 14)
        addView(AppStyle.text(this@MainActivity, label.uppercase(Locale.getDefault()), 9f, AppStyle.muted))
        addView(AppStyle.text(this@MainActivity, value, 26f, AppStyle.primary).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD; setPadding(0, AppStyle.dp(this@MainActivity, 2), 0, 0) })
    }

    private fun sectionHeader(title: String, action: String, listener: () -> Unit): LinearLayout = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL; setPadding(0, AppStyle.dp(this@MainActivity, 16), 0, AppStyle.dp(this@MainActivity, 8))
        addView(AppStyle.text(this@MainActivity, title, 16f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD }, LinearLayout.LayoutParams(0, -2, 1f))
        addView(AppStyle.text(this@MainActivity, action, 12f, AppStyle.primary).apply { setOnClickListener { listener() } })
    }

    private fun requestRow(request: ApplicantRequest): View = LinearLayout(this).apply {
        gravity = Gravity.CENTER_VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 13), AppStyle.dp(this@MainActivity, 10), AppStyle.dp(this@MainActivity, 13), AppStyle.dp(this@MainActivity, 10)); AppStyle.raised(this, 12)
        val info = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
        info.addView(AppStyle.text(this@MainActivity, "+${request.phone}", 14f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD })
        info.addView(AppStyle.text(this@MainActivity, formatDate(request.createdAt), 11f, AppStyle.muted))
        addView(info, LinearLayout.LayoutParams(0, -2, 1f))
        addView(statusBadge(request.status))
    }.also { it.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 8) } }

    private fun statusBadge(status: String): TextView = AppStyle.text(this, when (status) { "accepted" -> "Acceptée"; "rejected" -> "Rejetée"; "processing" -> "En cours"; else -> "En attente" }, 11f, when (status) { "accepted" -> AppStyle.success; "rejected" -> AppStyle.danger; else -> AppStyle.warning }).apply { gravity = Gravity.CENTER; setPadding(AppStyle.dp(this@MainActivity, 9), AppStyle.dp(this@MainActivity, 6), AppStyle.dp(this@MainActivity, 9), AppStyle.dp(this@MainActivity, 6)); background = AppStyle.inset(this@MainActivity, 9) }

    private fun renderRequests() {
        val add = AppStyle.button(this, "+  Nouvelle demande").apply { setOnClickListener { currentPage = Page.NEW_REQUEST; renderPage() } }
        pageBody.addView(add, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 48)).apply { bottomMargin = AppStyle.dp(this@MainActivity, 14) })
        if (requests.isEmpty()) pageBody.addView(emptyCard("Aucune demande pour l’instant.")) else requests.forEach { pageBody.addView(requestRow(it)) }
    }

    private fun renderNewRequest() {
        pageBody.addView(AppStyle.text(this, "Soumettez un numéro à vérifier et suivez son traitement en temps réel.", 13f, AppStyle.muted), LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 18) })
        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 18), AppStyle.dp(this@MainActivity, 18), AppStyle.dp(this@MainActivity, 18), AppStyle.dp(this@MainActivity, 18)); AppStyle.raised(this, 16) }
        val phone = EditText(this).apply { hint = "Numéro de téléphone à certifier"; inputType = 3; setSingleLine(true); setTextColor(AppStyle.text); setHintTextColor(AppStyle.muted) }
        card.addView(phone, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 54)).apply { bottomMargin = AppStyle.dp(this@MainActivity, 14) })
        val send = AppStyle.button(this, "Envoyer la demande")
        val message = AppStyle.text(this, "", 12f, AppStyle.muted)
        card.addView(send, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 48)))
        card.addView(message, LinearLayout.LayoutParams(-1, -2).apply { topMargin = AppStyle.dp(this@MainActivity, 10) })
        pageBody.addView(card)
        send.setOnClickListener {
            val number = phone.text.toString().trim()
            if (number.isBlank()) { message.text = "Saisissez un numéro valide."; message.setTextColor(AppStyle.danger); return@setOnClickListener }
            send.isEnabled = false; message.text = "Envoi en cours…"
            lifecycleScope.launch {
                try { api.createVerificationRequest(number); message.text = "Demande créée avec succès."; message.setTextColor(AppStyle.success); loadData() }
                catch (error: Exception) { message.text = "Impossible de créer la demande."; message.setTextColor(AppStyle.danger); send.isEnabled = true }
            }
        }
    }

    private fun renderNotifications() {
        if (notifications.isEmpty()) pageBody.addView(emptyCard("Aucune notification pour l’instant.")) else notifications.forEach { pageBody.addView(notificationRow(it)) }
    }

    private fun notificationRow(notification: ApplicantNotification): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 14), AppStyle.dp(this@MainActivity, 12), AppStyle.dp(this@MainActivity, 14), AppStyle.dp(this@MainActivity, 12)); AppStyle.raised(this, 12)
        addView(AppStyle.text(this@MainActivity, notification.title, 14f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD })
        addView(AppStyle.text(this@MainActivity, notification.body, 12f, AppStyle.muted).apply { setPadding(0, AppStyle.dp(this@MainActivity, 4), 0, 0) })
        addView(AppStyle.text(this@MainActivity, formatDate(notification.createdAt), 10f, AppStyle.muted).apply { setPadding(0, AppStyle.dp(this@MainActivity, 5), 0, 0) })
    }.also { it.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 8) } }

    private fun renderMessages() {
        pageBody.addView(emptyCard("Votre messagerie et vos échanges avec l’équipe apparaîtront ici."))
    }

    private fun renderSettings() {
        val profile = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(AppStyle.dp(this@MainActivity, 16), AppStyle.dp(this@MainActivity, 16), AppStyle.dp(this@MainActivity, 16), AppStyle.dp(this@MainActivity, 16)); AppStyle.raised(this, 16) }
        profile.addView(AppStyle.text(this, session.username ?: "Coach Mobile", 18f, AppStyle.text).apply { typeface = android.graphics.Typeface.DEFAULT_BOLD })
        profile.addView(AppStyle.text(this, "Compte Coach Mobile", 12f, AppStyle.muted).apply { setPadding(0, AppStyle.dp(this@MainActivity, 4), 0, AppStyle.dp(this@MainActivity, 14)) })
        val battery = AppStyle.button(this, "Configurer la batterie")
        battery.setOnClickListener { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
        profile.addView(battery, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 46)))
        val logout = AppStyle.button(this, "Se déconnecter", AppStyle.danger)
        logout.setOnClickListener { lifecycleScope.launch { runCatching { api.revokeDevice() }; session.clear(); showLogin() } }
        profile.addView(logout, LinearLayout.LayoutParams(-1, AppStyle.dp(this, 46)).apply { topMargin = AppStyle.dp(this@MainActivity, 10) })
        pageBody.addView(profile)
    }

    private fun emptyCard(message: String): View = AppStyle.text(this, message, 13f, AppStyle.muted).apply { gravity = Gravity.CENTER; setPadding(AppStyle.dp(this@MainActivity, 20), AppStyle.dp(this@MainActivity, 28), AppStyle.dp(this@MainActivity, 20), AppStyle.dp(this@MainActivity, 28)); background = AppStyle.inset(this@MainActivity, 14) }.also { it.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { bottomMargin = AppStyle.dp(this@MainActivity, 8) } }

    private fun formatDate(value: String): String = runCatching { SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault()).format(Date.from(java.time.Instant.parse(value))) }.getOrDefault(value.take(16).replace('T', ' '))

    private fun loadData() {
        lifecycleScope.launch {
            runCatching {
                requests = api.getApplicantRequests()
                notifications = api.getApplicantNotifications()
                if (::pageBody.isInitialized) renderPage()
            }
        }
    }

    private fun registerPushToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) return@addOnCompleteListener
            lifecycleScope.launch { runCatching { api.registerDevice(task.result, BuildConfig.VERSION_NAME) } }
        }
    }
}
