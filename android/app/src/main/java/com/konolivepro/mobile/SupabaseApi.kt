package com.konolivepro.mobile

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class SupabaseApi(context: Context) {
    private val store = SessionStore(context.applicationContext)
    private val client = OkHttpClient()
    private val jsonType = "application/json".toMediaType()
    private val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val anonKey = BuildConfig.SUPABASE_ANON_KEY

    private fun requestBuilder(url: String, authenticated: Boolean = true): Request.Builder =
        Request.Builder()
            .url(url)
            .header("apikey", anonKey)
            .header("Content-Type", "application/json")
            .apply {
                if (authenticated) store.accessToken?.let { header("Authorization", "Bearer $it") }
            }

    private suspend fun execute(request: Request): String = withContext(Dispatchers.IO) {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw IllegalStateException("Supabase ${response.code}: $text")
            text
        }
    }

    suspend fun login(identifier: String, password: String): JSONObject {
        val email = if (identifier.contains("@")) identifier else "$identifier@miaoda.com"
        val body = JSONObject().put("email", email).put("password", password)
        val request = requestBuilder("$baseUrl/auth/v1/token?grant_type=password", false)
            .post(body.toString().toRequestBody(jsonType))
            .build()
        val result = JSONObject(execute(request))
        store.accessToken = result.optString("access_token").takeIf { it.isNotBlank() }
        store.userId = result.optJSONObject("user")?.optString("id")
        store.username = identifier
        return result
    }

    suspend fun registerDevice(fcmToken: String, appVersion: String) {
        val body = JSONObject()
            .put("p_device_id", store.deviceId)
            .put("p_token", fcmToken)
            .put("p_platform", "android")
            .put("p_app_version", appVersion)
        val request = requestBuilder("$baseUrl/rest/v1/rpc/register_mobile_push_device")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        execute(request)
    }

    suspend fun revokeDevice() {
        val body = JSONObject().put("p_device_id", store.deviceId)
        val request = requestBuilder("$baseUrl/rest/v1/rpc/revoke_mobile_push_device")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        execute(request)
    }

    suspend fun respondToCall(callId: String, action: String): JSONObject {
        val body = JSONObject().put("p_call_id", callId).put("p_action", action)
        val request = requestBuilder("$baseUrl/rest/v1/rpc/respond_to_mobile_video_call")
            .post(body.toString().toRequestBody(jsonType))
            .build()
        val raw = execute(request)
        return if (raw.trimStart().startsWith("[")) JSONArray(raw).optJSONObject(0) ?: JSONObject() else JSONObject(raw)
    }

    suspend fun getCallState(callId: String): String? {
        val encoded = android.net.Uri.encode(callId)
        val request = requestBuilder("$baseUrl/rest/v1/video_call_states?call_id=eq.$encoded&select=state,expires_at")
            .get()
            .build()
        val rows = JSONArray(execute(request))
        return rows.optJSONObject(0)?.optString("state")
    }

    fun realtimeWebSocketUrl(): String = baseUrl
        .replaceFirst("https://", "wss://")
        .replaceFirst("http://", "ws://") + "/realtime/v1/websocket?apikey=$anonKey&vsn=1.0.0"
}
