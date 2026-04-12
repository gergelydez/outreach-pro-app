export interface Business {
  place_id: string
  name: string
  address: string
  phone: string
  phone_intl: string
  whatsapp_link: string
  rating: number
  reviews_count: number
  category: string
  category_label: string
  city: string
  is_small_city: boolean
  conversion_score: number    // 0-100, cât de probabil cumpără
  score_label: string         // 'Hot' | 'Warm' | 'Maybe' | 'Cold'
  score_color: string         // hex color
  score_emoji: string         // 🔥 ⚡ 👍 ❄️
  contact_email: string
  generated_subject: string
  generated_body: string
  generated_whatsapp: string
  generated_demo_html: string
  demo_status: 'none' | 'generating' | 'ready'
  conversation_stage: 'new' | 'sent_opening' | 'replied' | 'demo_sent' | 'negotiating' | 'closed_won' | 'closed_lost'
  reply_text: string
  notes: string
  status: 'found' | 'ready' | 'sent' | 'failed'
  contact_method: 'whatsapp' | 'email' | 'none'
  sent_at?: string
  replied_at?: string
  error?: string
  created_at: string
}

export interface Settings {
  googlePlacesApiKey: string
  anthropicApiKey: string
  senderEmail: string
  senderAppPassword: string
  senderName: string
  yourWebsite: string
  yourPortfolio: string
  yourPhone: string
  priceFrom: string
  priceTo: string
  deliveryDays: string
  maxEmailsPerDay: number
}

export interface DailyStats {
  date: string
  sent: number
  failed: number
}
