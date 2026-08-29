package com.konolivepro.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.InputType
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
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var session: SessionStore
    private lateinit var api: SupabaseApi
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private var role = "applicant"
    private var profile: JSONObject? = null

    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { renderEntry() }
    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val ok = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true || granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        Toast.makeText(this, if (ok) "Localisation autorisée" else "Localisation refusée", Toast.LENGTH_SHORT).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        api = SupabaseApi(this)
        CallNotifications.createChannels(this)
        handleIncomingIntent(intent)
        renderEntry()
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

    private fun renderEntry() {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return
        }
        if (session.accessToken.isNullOrBlank()) renderLogin() else loadProfileAndRenderHome()
    }

    private fun layout(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(20), dp(20), dp(20), dp(28))
        setBackgroundColor(Color.rgb(12, 15, 22))
    }

    private fun renderLogin() {
        val root = layout()
        root.gravity = Gravity.CENTER_HORIZONTAL
        root.addView(TextView(this).apply { text = "Konolive"; textSize = 34f; setTextColor(Color.WHITE); gravity = Gravity.CENTER }, lp(-1, -2))
        root.addView(TextView(this).apply { text = "Votre espace de vérification mobile"; textSize = 16f; setTextColor(Color.LTGRAY); gravity = Gravity.CENTER; setPadding(0, dp(8), 0, dp(28)) }, lp(-1, -2))
        val identifier = field("E-mail", false)
        val password = field("Mot de passe", true)
        root.addView(identifier, lp(-1, dp(56), 0, dp(12)))
        root.addView(password, lp(-1, dp(56), 0, dp(18)))
        val login = Button(this).apply { text = "Se connecter" }
        root.addView(login, lp(-1, dp(56)))
        val state = TextView(this).apply { setTextColor(Color.LTGRAY); setPadding(0, dp(16), 0, 0) }
        root.addView(state, lp(-1, -2))
        login.setOnClickListener {
            val user = identifier.text.toString().trim()
            val pass = password.text.toString()
            if (user.isBlank() || pass.isBlank()) { state.text = "Saisissez vos identifiants."; return@setOnClickListener }
            login.isEnabled = false
            state.text = "Connexion…"
            lifecycleScope.launch {
                runCatching { api.login(user, pass) }
                    .onSuccess { registerPush(); loadProfileAndRenderHome() }
                    .onFailure { login.isEnabled = true; state.text = "Connexion impossible : ${it.message ?: "réessayez"}" }
            }
        }
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun loadProfileAndRenderHome() {
        lifecycleScope.launch {
            profile = runCatching { api.getCurrentProfile() }.getOrNull()
            role = profile?.optString("role", "applicant") ?: "applicant"
            renderHome()
            registerPush()
        }
    }

    private fun renderHome() {
        val root = layout()
        val username = profile?.optString("username")?.takeIf { it.isNotBlank() } ?: session.username ?: "Utilisateur"
        root.addView(TextView(this).apply { text = "Bonjour, $username"; textSize = 28f; setTextColor(Color.WHITE) }, lp(-1, -2, 0, dp(5)))
        root.addView(TextView(this).apply { text = "Rôle : ${roleLabel(role)}"; textSize = 15f; setTextColor(Color.LTGRAY); setPadding(0, 0, 0, dp(20)) }, lp(-1, -2))
        root.addView(section("Tableau de bord"), lp(-1, -2, 0, dp(8)))
        root.addView(action("Actualiser les données") { loadProfileAndRenderHome() }, lp(-1, dp(50), 0, dp(16)))
        when (role) {
            "agent" -> addAgentMenu(root)
            "supervisor" -> addSupervisorMenu(root)
            "admin" -> addAdminMenu(root)
            else -> addApplicantMenu(root)
        }
        root.addView(section("Compte et services"), lp(-1, -2, 0, dp(8)))
        root.addView(action("Notifications") { showNotifications() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Messages") { showRequestsForMessages() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Paramètres et profil") { showSettings() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Autoriser la localisation") { requestLocation() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Se déconnecter") { logout() }, lp(-1, dp(50)))
        setContentView(ScrollView(this).apply { addView(root) })
    }

    private fun addApplicantMenu(root: LinearLayout) {
        root.addView(action("Mes demandes") { showRequests(false) }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Nouvelle demande de vérification") { showNewRequest() }, lp(-1, dp(50), 0, dp(8)))
    }

    private fun addAgentMenu(root: LinearLayout) {
        root.addView(action("Demandes à traiter") { showRequests(true) }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Historique de traitement") { showRequests(true) }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Performances et suivi mensuel") { showStats() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Mon GSM et évolution journalière") { showSettings() }, lp(-1, dp(50), 0, dp(8)))
    }

    private fun addSupervisorMenu(root: LinearLayout) {
        root.addView(action("Demandes et transferts") { showRequests(true) }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Présence et statistiques agents") { showStats() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Rapports et historique") { showStats() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Options de traitement") { showSettings() }, lp(-1, dp(50), 0, dp(8)))
    }

    private fun addAdminMenu(root: LinearLayout) {
        root.addView(action("Toutes les demandes") { showRequests(true) }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Utilisateurs") { showUsers() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Statistiques et logs") { showStats() }, lp(-1, dp(50), 0, dp(8)))
        root.addView(action("Configuration et intégrations") { showSettings() }, lp(-1, dp(50), 0, dp(8)))
    }

    private fun showRequests(includeAll: Boolean) {
        val body = screen("Demandes")
        body.addView(ProgressBar(this), lp(-1, dp(48)))
        lifecycleScope.launch {
            val requests = runCatching { if (includeAll) api.getAllRequestsJson() else api.getRequestsForCurrentUser() }.getOrElse { emptyList() }
            body.removeAllViews()
            if (requests.isEmpty()) body.addView(message("Aucune demande disponible."), lp(-1, -2))
            requests.forEach { request ->
                val id = request.optString("id")
                val phone = request.optString("phone_to_certify", "Numéro inconnu")
                val status = request.optString("status", "inconnu")
                val card = action("$phone\nStatut : ${statusLabel(status)}") { showRequestDetail(request) }
                body.addView(card, lp(-1, dp(72), 0, dp(8)))
            }
        }
    }

    private fun showRequestDetail(request: JSONObject) {
        val body = screen("Détail de la demande")
        val id = request.optString("id")
        body.addView(message("Identifiant : $id\nNuméro : ${request.optString("phone_to_certify", "—")}\nStatut : ${statusLabel(request.optString("status"))}\nCréée le : ${request.optString("created_at", "—")}"), lp(-1, -2, 0, dp(14)))
        val notes = field("Notes ou résultat", false)
        body.addView(notes, lp(-1, dp(100), 0, dp(10)))
        if (role == "agent" || role == "supervisor" || role == "admin") {
            body.addView(action("Prendre en charge") {
                lifecycleScope.launch { runCatching { api.claimRequestJson(id) }.onSuccess { Toast.makeText(this@MainActivity, "Demande prise en charge", Toast.LENGTH_SHORT).show(); showRequests(true) }.onFailure { toastError(it) } }
            }, lp(-1, dp(50), 0, dp(8)))
            body.addView(action("Marquer comme acceptée") { updateRequest(id, "accepted", notes.text.toString()) }, lp(-1, dp(50), 0, dp(8)))
            body.addView(action("Marquer comme rejetée") { updateRequest(id, "rejected", notes.text.toString()) }, lp(-1, dp(50), 0, dp(8)))
        }
        body.addView(action("Ouvrir la conversation") { showMessages(id, request.optString("applicant_id")) }, lp(-1, dp(50), 0, dp(8)))
    }

    private fun showNewRequest() {
        val body = screen("Nouvelle demande")
        body.addView(message("Saisissez le numéro de téléphone à vérifier. La création utilise la même RPC sécurisée que le site web."), lp(-1, -2, 0, dp(12)))
        val phone = field("Numéro à vérifier", false)
        body.addView(phone, lp(-1, dp(56), 0, dp(12)))
        body.addView(action("Créer la demande") {
            if (phone.text.toString().trim().isBlank()) {
                toast("Saisissez un numéro")
            } else {
                lifecycleScope.launch { runCatching { api.createVerificationRequest(phone.text.toString().trim()) }.onSuccess { toast("Demande créée"); showRequests(false) }.onFailure { toastError(it) } }
            }
        }, lp(-1, dp(52)))
    }

    private fun updateRequest(id: String, status: String, notes: String) {
        lifecycleScope.launch { runCatching { api.updateRequestJson(id, JSONObject().put("status", status).put("notes", notes)) }.onSuccess { toast("Demande mise à jour"); showRequests(true) }.onFailure { toastError(it) } }
    }

    private fun showNotifications() {
        val body = screen("Notifications")
        body.addView(ProgressBar(this), lp(-1, dp(48)))
        lifecycleScope.launch {
            val rows = runCatching { api.getApplicantNotifications(50) }.getOrElse { emptyList() }
            body.removeAllViews()
            if (rows.isEmpty()) body.addView(message("Aucune notification."), lp(-1, -2))
            rows.forEach { n -> body.addView(message("${n.title}\n${n.body}\n${n.createdAt}"), lp(-1, -2, 0, dp(10))) }
        }
    }

    private fun showRequestsForMessages() {
        showRequests(role != "applicant")
    }

    private fun showMessages(requestId: String, receiverId: String) {
        val body = screen("Messages")
        val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        body.addView(list, lp(-1, 0, 1f))
        val input = field("Votre message", false)
        val send = action("Envoyer") {
            if (input.text.toString().isNotBlank()) lifecycleScope.launch { runCatching { api.sendMessageJson(requestId, receiverId, input.text.toString()) }.onSuccess { input.text.clear(); showMessages(requestId, receiverId) }.onFailure { toastError(it) } }
        }
        body.addView(input, lp(-1, dp(56), 0, dp(8))); body.addView(send, lp(-1, dp(50)))
        lifecycleScope.launch {
            val rows = runCatching { api.getMessagesJson(requestId) }.getOrElse { emptyList() }
            list.removeAllViews()
            rows.forEach { m -> list.addView(message("${m.optString("sender_id")}\n${m.optString("content")}\n${m.optString("created_at")}"), lp(-1, -2, 0, dp(8))) }
        }
    }

    private fun showStats() {
        val body = screen("Statistiques")
        body.addView(ProgressBar(this), lp(-1, dp(48)))
        lifecycleScope.launch {
            val rows = runCatching { api.getDailyStatsJson() }.getOrElse { emptyList() }
            body.removeAllViews()
            if (rows.isEmpty()) body.addView(message("Aucune statistique disponible."), lp(-1, -2))
            rows.forEach { row -> body.addView(message(row.toString()), lp(-1, -2, 0, dp(8))) }
        }
    }

    private fun showUsers() {
        val body = screen("Utilisateurs")
        body.addView(ProgressBar(this), lp(-1, dp(48)))
        lifecycleScope.launch {
            val rows = runCatching { api.getUsersJson() }.getOrElse { emptyList() }
            body.removeAllViews()
            rows.forEach { row -> body.addView(message("${row.optString("username", "—")} — ${roleLabel(row.optString("role"))}\nActif : ${row.optBoolean("is_active", false)}\n${row.optString("email", "")}"), lp(-1, -2, 0, dp(8))) }
        }
    }

    private fun showSettings() {
        val body = screen("Paramètres et profil")
        val name = field("Nom d’utilisateur", false); name.setText(profile?.optString("username", session.username ?: ""))
        val phone = field("Téléphone", false); phone.setText(profile?.optString("phone", ""))
        body.addView(name, lp(-1, dp(56), 0, dp(8))); body.addView(phone, lp(-1, dp(56), 0, dp(12)))
        body.addView(action("Enregistrer le profil") {
            lifecycleScope.launch { runCatching { api.updateProfileJson(JSONObject().put("username", name.text.toString()).put("phone", phone.text.toString())) }.onSuccess { toast("Profil enregistré") }.onFailure { toastError(it) } }
        }, lp(-1, dp(52)))
    }

    private fun screen(title: String): LinearLayout {
        val root = layout()
        root.addView(action("‹ Accueil") { renderHome() }, lp(-1, dp(46), 0, dp(12)))
        root.addView(TextView(this).apply { text = title; textSize = 27f; setTextColor(Color.WHITE) }, lp(-1, -2, 0, dp(16)))
        setContentView(ScrollView(this).apply { addView(root) })
        return root
    }

    private fun registerPush() {
        if (session.accessToken.isNullOrBlank()) return
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token -> lifecycleScope.launch { runCatching { api.registerDevice(token, BuildConfig.VERSION_NAME) } } }
    }

    private fun requestLocation() {
        locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
    }

    private fun logout() {
        lifecycleScope.launch { runCatching { api.revokeDevice() }; session.clear(); renderLogin() }
    }

    private fun field(hint: String, secret: Boolean): EditText = EditText(this).apply {
        this.hint = hint; setSingleLine(false); setTextColor(Color.WHITE); setHintTextColor(Color.GRAY)
        inputType = if (secret) InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_CLASS_TEXT
    }

    private fun action(label: String, onClick: () -> Unit): Button = Button(this).apply { text = label; setOnClickListener { onClick() } }
    private fun section(text: String): TextView = TextView(this).apply { this.text = text; textSize = 18f; setTextColor(Color.WHITE) }
    private fun message(text: String): TextView = TextView(this).apply { this.text = text; textSize = 15f; setTextColor(Color.LTGRAY); setPadding(dp(14), dp(14), dp(14), dp(14)); setBackgroundColor(Color.rgb(28, 34, 46)) }
    private fun roleLabel(value: String) = when (value) { "agent" -> "Agent"; "supervisor" -> "Superviseur"; "admin" -> "Administrateur"; else -> "Coach mobile" }
    private fun statusLabel(value: String) = when (value.lowercase()) { "pending" -> "En attente"; "processing" -> "En traitement"; "accepted" -> "Acceptée"; "rejected" -> "Rejetée"; "unchanged" -> "Inchangée"; "other" -> "Autre"; else -> value.ifBlank { "Inconnu" } }
    private fun toast(text: String) = Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
    private fun toastError(error: Throwable) = toast(error.message ?: "Opération impossible")
    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
    private fun lp(width: Int, height: Int, weight: Number = 0f, bottom: Int = 0) = LinearLayout.LayoutParams(width, height, weight.toFloat()).apply { bottomMargin = bottom }
}
