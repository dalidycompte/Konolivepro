package com.konolivepro.mobile

import android.content.Context
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit
import kotlin.math.min

class RealtimeDataSync(
    private val context: Context,
    private val api: SupabaseApi,
    private val accessToken: String,
    private val userId: String
) {
    private val client = OkHttpClient.Builder().pingInterval(25, TimeUnit.SECONDS).build()
    private var socket: WebSocket? = null
    private var stopped = false
    private var retryAttempt = 0

    fun start() {
        stopped = false
        retryAttempt = 0
        connect()
    }

    fun stop() {
        stopped = true
        socket?.close(1000, "activity stopped")
        socket = null
    }

    private fun connect() {
        if (stopped) return
        val request = Request.Builder().url(api.realtimeWebSocketUrl()).build()
        socket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: okhttp3.Response) {
                retryAttempt = 0
                val changes = JSONArray()
                    .put(JSONObject().put("event", "*").put("schema", "public").put("table", "verification_requests").put("filter", "applicant_id=eq.$userId"))
                    .put(JSONObject().put("event", "*").put("schema", "public").put("table", "notifications").put("filter", "user_id=eq.$userId"))
                val join = JSONObject()
                    .put("topic", "realtime:konolive-applicant-$userId")
                    .put("event", "phx_join")
                    .put("ref", "1")
                    .put("payload", JSONObject()
                        .put("access_token", accessToken)
                        .put("config", JSONObject()
                            .put("broadcast", JSONObject().put("self", false))
                            .put("presence", JSONObject().put("key", ""))
                            .put("postgres_changes", changes)))
                webSocket.send(join.toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                runCatching {
                    val message = JSONObject(text)
                    if (message.optString("event") == "postgres_changes") {
                        OfflineSyncScheduler.syncNow(context.applicationContext)
                    }
                }.onFailure { Log.w(TAG, "Realtime event ignored", it) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: okhttp3.Response?) {
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (!stopped) scheduleReconnect()
            }
        })
    }

    private fun scheduleReconnect() {
        if (stopped) return
        val delay = min(60_000L, 1_000L shl min(retryAttempt, 6))
        retryAttempt++
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ connect() }, delay)
    }

    companion object { private const val TAG = "KonoliveRealtimeData" }
}
