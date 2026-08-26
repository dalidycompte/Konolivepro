package com.konolivepro.mobile

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.TextView

object AppStyle {
    val background = Color.rgb(224, 229, 236)
    val darkShadow = Color.rgb(163, 177, 198)
    val lightSurface = Color.WHITE
    val text = Color.rgb(61, 74, 92)
    val muted = Color.rgb(110, 127, 149)
    val primary = Color.rgb(229, 57, 53)
    val primaryDark = Color.rgb(198, 40, 40)
    val success = Color.rgb(46, 145, 84)
    val warning = Color.rgb(229, 145, 40)
    val danger = Color.rgb(198, 55, 55)

    fun dp(context: Context, value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    fun text(context: Context, value: String, size: Float, color: Int = text): TextView = TextView(context).apply {
        text = value
        textSize = size
        setTextColor(color)
        typeface = android.graphics.Typeface.create("sans", android.graphics.Typeface.NORMAL)
    }

    fun title(context: Context, value: String): TextView = text(context, value, 24f, text).apply {
        typeface = android.graphics.Typeface.DEFAULT_BOLD
    }

    fun card(context: Context, radius: Int = 18): GradientDrawable = GradientDrawable().apply {
        setColor(background)
        cornerRadius = dp(context, radius).toFloat()
    }

    fun inset(context: Context, radius: Int = 16): GradientDrawable = GradientDrawable().apply {
        setColor(background)
        cornerRadius = dp(context, radius).toFloat()
        setStroke(dp(context, 1), darkShadow)
    }

    fun button(context: Context, label: String, color: Int = primary): TextView = TextView(context).apply {
        text = label
        textSize = 14f
        gravity = android.view.Gravity.CENTER
        setTextColor(Color.WHITE)
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        background = GradientDrawable().apply { setColor(color); cornerRadius = dp(context, 12).toFloat() }
        elevation = dp(context, 5).toFloat()
        setPadding(dp(context, 18), dp(context, 12), dp(context, 18), dp(context, 12))
    }

    fun raised(view: View, radius: Int = 18) {
        view.background = card(view.context, radius)
        view.elevation = dp(view.context, 7).toFloat()
    }
}
