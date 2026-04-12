import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    to,
    subject,
    emailBody,
    senderEmail:       clientEmail,
    senderAppPassword: clientPassword,
    senderName:        clientName,
  } = body

  const email    = process.env.SENDER_EMAIL        || clientEmail
  const password = process.env.SENDER_APP_PASSWORD || clientPassword
  const name     = process.env.SENDER_NAME         || clientName || ''

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Lipsă credențiale email. Configurează în Setări.' },
      { status: 400 },
    )
  }

  if (!to || !subject || !emailBody) {
    return NextResponse.json({ error: 'Câmpuri lipsă: to, subject, emailBody' }, { status: 400 })
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  })

  try {
    await transporter.sendMail({
      from:    name ? `${name} <${email}>` : email,
      to,
      subject,
      text:    emailBody,
    })
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
