package com.konolivepro.mobile

import android.Manifest
import android.annotation.SuppressLint
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.JavascriptInterface
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.launch
import org.json.JSONTokener

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var session: SessionStore
    private lateinit var api: SupabaseApi
    private lateinit var offlineStore: OfflineStore
    private var realtimeDataSync: RealtimeDataSync? = null
    private var pendingIncomingCall: String? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingFcmToken: String? = null
    private var pendingWebPermission: PermissionRequest? = null

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) Log.d("KONOLIVE", "Notifications autorisées")
        else Log.d("KONOLIVE", "Notifications refusées")
    }

    private val mediaPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { result ->
        val request = pendingWebPermission ?: return@registerForActivityResult
        val allowed = result[Manifest.permission.CAMERA] == true && result[Manifest.permission.RECORD_AUDIO] == true
        if (allowed) request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE, PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else request.deny()
        pendingWebPermission = null
    }

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        val uris = if (result.resultCode == RESULT_OK) {
            val data = result.data
            val clip = data?.clipData
            when {
                clip != null -> Array(clip.itemCount) { index -> clip.getItemAt(index).uri }
                data?.data != null -> arrayOf(data.data!!)
                else -> null
            }
        } else null
        callback.onReceiveValue(uris)
        fileChooserCallback = null
    }

    private val nativeEvents = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                ACTION_INCOMING_CALL -> {
                    pendingIncomingCall = intent.getStringExtra(CALL_JSON)
                    dispatchIncomingCall()
                }
                ACTION_FCM_TOKEN -> {
                    pendingFcmToken = intent.getStringExtra(FCM_TOKEN)
                    syncWebSession()
                }
                ACTION_CALL_STATE -> {
                    val callId = intent.getStringExtra(CALL_ID).orEmpty()
                    val state = intent.getStringExtra(CALL_STATE).orEmpty()
                    val payload = "{\"call_id\":${js(callId)},\"state\":${js(state)}}"
                    runCatching { webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('konolive:call_state',{detail:$payload}));", null) }
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        session = SessionStore(this)
        api = SupabaseApi(this)
        offlineStore = OfflineStore(this)
        OfflineSyncScheduler.install(this)
        OfflineConnectivity.register(this)
        OfflineSyncScheduler.syncNow(this)
        CallNotifications.createChannels(this)
        requestNotificationPermission()
        pendingIncomingCall = intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON)
        configureWebView()
        registerNativeEvents()
        requestFcmToken()
    }

    private fun registerNativeEvents() {
        val filter = IntentFilter().apply {
            addAction(ACTION_INCOMING_CALL)
            addAction(ACTION_FCM_TOKEN)
            addAction(ACTION_CALL_STATE)
        }
        ContextCompat.registerReceiver(this, nativeEvents, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }


    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        webView = WebView(this)
        webView.setBackgroundColor(AppStyle.background)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            cacheMode = if (isNetworkAvailable()) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
            userAgentString = "$userAgentString KonoliveAndroid/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
        webView.addJavascriptInterface(WebAppBridge(), "AndroidOffline")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = handleUrl(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleUrl(Uri.parse(url))
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                syncWebSession()
                OfflineSyncScheduler.syncNow(this@MainActivity)
                dispatchIncomingCall()
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) view.loadUrl("file:///android_asset/offline.html")
            }
            override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) {
                super.doUpdateVisitedHistory(view, url, isReload)
                syncWebSession()
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "image/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                filePicker.launch(intent)
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.host != WEBSITE_HOST) { request.deny(); return@runOnUiThread }
                    val needsMedia = request.resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE || it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
                    if (!needsMedia) { request.deny(); return@runOnUiThread }
                    val cameraGranted = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                    val micGranted = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
                    if (cameraGranted && micGranted) {
                        request.grant(request.resources.filter { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE || it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }.toTypedArray())
                    } else {
                        pendingWebPermission = request
                        mediaPermissionLauncher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
                    }
                }
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String?, callback: GeolocationPermissions.Callback?) {
                if (origin?.startsWith(WEBSITE_ORIGIN) == true) callback?.invoke(origin, false, false) else callback?.invoke(origin, false, false)
            }

            override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean = BuildConfig.DEBUG
        }
        setContentView(FrameLayout(this).apply { addView(webView, ViewGroup.LayoutParams(-1, -1)) })
        webView.loadUrl(WEBSITE_URL)
    }

    private fun isNetworkAvailable(): Boolean {
        val manager = getSystemService(ConnectivityManager::class.java) ?: return false
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private inner class WebAppBridge {
        @JavascriptInterface fun isOnline(): Boolean = isNetworkAvailable()
        @JavascriptInterface fun cachedSnapshot(): String = offlineStore.cachedJson().toString()
        @JavascriptInterface fun pendingCount(): Int = offlineStore.outboxCount()
        @JavascriptInterface fun retry() = runOnUiThread { webView.loadUrl(WEBSITE_URL) }
        @JavascriptInterface fun syncNow() = OfflineSyncScheduler.syncNow(this@MainActivity)
        @JavascriptInterface fun queueCreateRequest(phone: String): String {
            if (phone.isBlank()) return "invalid"
            offlineStore.enqueue(OfflineSyncWorker.OP_CREATE_REQUEST, org.json.JSONObject().put("phone", phone))
            OfflineSyncScheduler.syncNow(this@MainActivity)
            return "queued"
        }
    }

    private fun handleUrl(url: Uri): Boolean {
        val scheme = url.scheme.orEmpty()
        if (scheme == "http" || scheme == "https") {
            if (url.host == WEBSITE_HOST) return false
            startActivity(Intent(Intent.ACTION_VIEW, url))
            return true
        }
        if (scheme == "mailto" || scheme == "tel") {
            startActivity(Intent(Intent.ACTION_VIEW, url))
            return true
        }
        return true
    }

    private fun requestFcmToken() {
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (task.isSuccessful) {
                pendingFcmToken = task.result
                syncWebSession()
            }
        }
    }

    private fun syncWebSession() {
        if (!::webView.isInitialized) return
        val script = """
            (function(){
              var item = Object.entries(localStorage).find(function(entry){ return entry[0].indexOf('auth-token') >= 0; });
              return item ? JSON.stringify({key:item[0],value:item[1]}) : '';
            })();
        """.trimIndent()
        webView.evaluateJavascript(script) { rawResult ->
            val raw = runCatching { JSONTokener(rawResult).nextValue() as? String }.getOrNull().orEmpty()
            if (raw.isBlank()) return@evaluateJavascript
            runCatching {
                val sessionJson = org.json.JSONObject(raw)
                val value = org.json.JSONObject(sessionJson.getString("value"))
                session.accessToken = value.optString("access_token").takeIf { it.isNotBlank() }
                session.userId = value.optJSONObject("user")?.optString("id")?.takeIf { it.isNotBlank() }
                if (session.accessToken != null && session.userId != null && realtimeDataSync == null) {
                    realtimeDataSync = RealtimeDataSync(this@MainActivity, api, session.accessToken!!, session.userId!!).also { it.start() }
                }
                if (pendingFcmToken != null && session.accessToken != null) {
                    val token = pendingFcmToken
                    pendingFcmToken = null
                    lifecycleScope.launch { runCatching { api.registerDevice(token!!, BuildConfig.VERSION_NAME) } }
                }
            }
        }
    }

    private fun dispatchIncomingCall() {
        val json = pendingIncomingCall ?: return
        if (!::webView.isInitialized) return
        val safe = json.replace("\\", "\\\\").replace("'", "\\'")
        val script = "window.dispatchEvent(new CustomEvent('konolive:incoming_call',{detail:JSON.parse('$safe')}));"
        webView.evaluateJavascript(script) { pendingIncomingCall = null }
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        intent.getStringExtra(CallNotifications.EXTRA_CALL_JSON)?.let { pendingIncomingCall = it; dispatchIncomingCall() }
    }

    override fun onDestroy() {
        runCatching { unregisterReceiver(nativeEvents) }
        realtimeDataSync?.stop()
        realtimeDataSync = null
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun js(value: String): String = org.json.JSONObject.quote(value)

    companion object {
        const val WEBSITE_URL = "https://dalidycompte.github.io/Konolivepro/"
        const val WEBSITE_ORIGIN = "https://dalidycompte.github.io"
        const val WEBSITE_HOST = "dalidycompte.github.io"
    }
}
