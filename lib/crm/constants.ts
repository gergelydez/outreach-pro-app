// Constante comune ale modulului CRM UK (folosite pe server și în interfață).

export const STAGES = [
  { key: 'new_lead', label: 'New Lead' },
  { key: 'researching', label: 'Researching' },
  { key: 'qualified', label: 'Qualified' },
  { key: 'ready_to_contact', label: 'Ready to Contact' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'follow_up_1', label: 'Follow-up 1' },
  { key: 'follow_up_2', label: 'Follow-up 2' },
  { key: 'replied', label: 'Replied' },
  { key: 'interested', label: 'Interested' },
  { key: 'call_meeting', label: 'Call / Meeting' },
  { key: 'proposal_sent', label: 'Proposal Sent' },
  { key: 'negotiation', label: 'Negotiation' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'not_a_fit', label: 'Not a Fit' },
] as const
export type StageKey = typeof STAGES[number]['key']
export const STAGE_KEYS = STAGES.map(s => s.key) as readonly string[]
export const stageLabel = (k: string) => STAGES.find(s => s.key === k)?.label || k
// Etape care contează ca „contactat” pentru rapoarte
export const CONTACTED_STAGES = ['contacted', 'follow_up_1', 'follow_up_2', 'replied', 'interested', 'call_meeting', 'proposal_sent', 'negotiation', 'won', 'lost']
export const CLOSED_STAGES = ['won', 'lost', 'not_a_fit']

export const WEBSITE_STATUSES = [
  'NO_WEBSITE', 'SOCIAL_ONLY', 'DIRECTORY_ONLY', 'FREE_SUBDOMAIN', 'BROKEN_WEBSITE',
  'OUTDATED_WEBSITE', 'NEEDS_REDESIGN', 'GOOD_WEBSITE', 'UNVERIFIED',
] as const
export type WebsiteStatus = typeof WEBSITE_STATUSES[number]
export const WEBSITE_STATUS_LABEL: Record<string, string> = {
  NO_WEBSITE: 'No website', SOCIAL_ONLY: 'Social only', DIRECTORY_ONLY: 'Directory only', FREE_SUBDOMAIN: 'Free subdomain',
  BROKEN_WEBSITE: 'Broken website', OUTDATED_WEBSITE: 'Outdated website', NEEDS_REDESIGN: 'Needs redesign',
  GOOD_WEBSITE: 'Website good', UNVERIFIED: 'Unverified',
}

export const WHATSAPP_STATUSES = ['FOUND', 'NOT_FOUND', 'UNVERIFIED'] as const

export const UK_CATEGORIES: { key: string; label: string; query: string; placesType?: string }[] = [
  { key: 'plumber', label: 'Plumbers', query: 'plumber', placesType: 'plumber' },
  { key: 'electrician', label: 'Electricians', query: 'electrician', placesType: 'electrician' },
  { key: 'heating_engineer', label: 'Heating engineers', query: 'heating engineer boiler repair' },
  { key: 'builder', label: 'Builders', query: 'builder', placesType: 'general_contractor' },
  { key: 'roofer', label: 'Roofers', query: 'roofer', placesType: 'roofing_contractor' },
  { key: 'painter_decorator', label: 'Painters and decorators', query: 'painter and decorator', placesType: 'painter' },
  { key: 'cleaning', label: 'Cleaning companies', query: 'cleaning company' },
  { key: 'landscaping', label: 'Landscaping companies', query: 'landscaping company landscaper' },
  { key: 'locksmith', label: 'Locksmiths', query: 'locksmith', placesType: 'locksmith' },
  { key: 'carpenter', label: 'Carpenters & joiners', query: 'carpenter joiner' },
  { key: 'plasterer', label: 'Plasterers', query: 'plasterer' },
  { key: 'handyman', label: 'Handymen', query: 'handyman' },
]
export const categoryLabel = (k: string) => UK_CATEGORIES.find(c => c.key === k)?.label || k

export const UK_REGIONS: Record<string, string[]> = {
  'West Midlands': ['Birmingham', 'Wolverhampton', 'Coventry', 'Solihull', 'Dudley', 'Walsall', 'West Bromwich', 'Sutton Coldfield', 'Stourbridge', 'Halesowen'],
  'East Midlands': ['Nottingham', 'Leicester', 'Derby', 'Northampton', 'Lincoln'],
  'Greater London': ['London', 'Croydon', 'Bromley', 'Harrow', 'Ealing'],
  'North West': ['Manchester', 'Liverpool', 'Bolton', 'Stockport', 'Preston'],
  'Yorkshire': ['Leeds', 'Sheffield', 'Bradford', 'York', 'Hull'],
}

export const OPPORTUNITY_LABELS = [
  { min: 80, key: 'excellent', label: 'Excellent opportunity' },
  { min: 60, key: 'high', label: 'High opportunity' },
  { min: 40, key: 'medium', label: 'Medium opportunity' },
  { min: 0, key: 'low', label: 'Low opportunity' },
]
export const opportunityLabel = (score: number) => OPPORTUNITY_LABELS.find(l => score >= l.min)!

export const SUBSCRIBER_TYPES = [
  { key: 'corporate', label: 'Corporate subscriber (Ltd, LLP, plc)' },
  { key: 'sole_trader', label: 'Sole trader / partnership (individual subscriber)' },
  { key: 'unknown', label: 'Unknown — check before emailing' },
]

export const OUTREACH_CHANNELS = ['email', 'whatsapp', 'contact_form', 'linkedin', 'phone'] as const
