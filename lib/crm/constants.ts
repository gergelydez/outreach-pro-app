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
  // meserii (casă și construcții)
  { key: 'plumber', label: 'Plumbers', query: 'plumber', placesType: 'plumber' },
  { key: 'electrician', label: 'Electricians', query: 'electrician', placesType: 'electrician' },
  { key: 'heating_engineer', label: 'Heating engineers', query: 'heating engineer boiler repair' },
  { key: 'builder', label: 'Builders', query: 'builder', placesType: 'general_contractor' },
  { key: 'roofer', label: 'Roofers', query: 'roofer', placesType: 'roofing_contractor' },
  { key: 'painter_decorator', label: 'Painters and decorators', query: 'painter and decorator', placesType: 'painter' },
  { key: 'cleaning', label: 'Cleaning companies', query: 'cleaning company' },
  { key: 'landscaping', label: 'Landscapers', query: 'landscaping company landscaper' },
  { key: 'locksmith', label: 'Locksmiths', query: 'locksmith', placesType: 'locksmith' },
  { key: 'carpenter', label: 'Carpenters & joiners', query: 'carpenter joiner' },
  { key: 'plasterer', label: 'Plasterers', query: 'plasterer' },
  { key: 'handyman', label: 'Handymen', query: 'handyman' },
  { key: 'tiler', label: 'Tilers', query: 'tiler tiling' },
  { key: 'gardener', label: 'Gardeners', query: 'gardener garden maintenance' },
  { key: 'tree_surgeon', label: 'Tree surgeons', query: 'tree surgeon' },
  { key: 'fencing', label: 'Fencing contractors', query: 'fencing contractor' },
  { key: 'driveways', label: 'Driveway & paving companies', query: 'driveway paving contractor' },
  { key: 'window_cleaner', label: 'Window cleaners', query: 'window cleaner' },
  { key: 'carpet_cleaning', label: 'Carpet cleaners', query: 'carpet cleaning' },
  { key: 'removals', label: 'Removal companies', query: 'removals man and van' },
  { key: 'pest_control', label: 'Pest control companies', query: 'pest control' },
  { key: 'scaffolding', label: 'Scaffolders', query: 'scaffolding company' },
  { key: 'damp_proofing', label: 'Damp proofing companies', query: 'damp proofing specialist' },
  { key: 'double_glazing', label: 'Double glazing companies', query: 'double glazing windows doors' },
  { key: 'chimney_sweep', label: 'Chimney sweeps', query: 'chimney sweep' },
  { key: 'accountant', label: 'Accountants', query: 'accountant small business' },
  // auto
  { key: 'car_repair', label: 'Garages', query: 'car garage mechanic MOT', placesType: 'car_repair' },
  { key: 'mobile_mechanic', label: 'Mobile mechanics', query: 'mobile mechanic' },
  { key: 'car_wash', label: 'Car washes', query: 'hand car wash valeting', placesType: 'car_wash' },
  { key: 'tyres', label: 'Tyre shops', query: 'tyre shop' },
  { key: 'body_shop', label: 'Body shops', query: 'car body repair' },
  { key: 'driving_instructor', label: 'Driving instructors', query: 'driving instructor' },
  // frumusețe și îngrijire
  { key: 'barber', label: 'Barbers', query: 'barber shop' },
  { key: 'hairdresser', label: 'Hairdressers', query: 'hair salon hairdresser', placesType: 'hair_care' },
  { key: 'beauty_salon', label: 'Beauty salons', query: 'beauty salon', placesType: 'beauty_salon' },
  { key: 'nail_salon', label: 'Nail salons', query: 'nail salon' },
  { key: 'lash_brow', label: 'Lash & brow studios', query: 'lash and brow studio' },
  { key: 'massage', label: 'Massage therapists', query: 'massage therapist' },
  { key: 'tattoo', label: 'Tattoo studios', query: 'tattoo studio' },
  { key: 'dog_groomer', label: 'Dog groomers', query: 'dog groomer' },
  { key: 'personal_trainer', label: 'Personal trainers', query: 'personal trainer' },
  // mâncare și local
  { key: 'takeaway', label: 'Takeaways', query: 'takeaway', placesType: 'meal_takeaway' },
  { key: 'cafe', label: 'Cafés', query: 'cafe', placesType: 'cafe' },
  { key: 'bakery', label: 'Bakeries', query: 'bakery', placesType: 'bakery' },
  { key: 'caterer', label: 'Caterers', query: 'catering company' },
  { key: 'florist', label: 'Florists', query: 'florist', placesType: 'florist' },
  { key: 'tailor', label: 'Tailors & alterations', query: 'tailor alterations' },
  { key: 'phone_repair', label: 'Phone repair shops', query: 'phone repair shop' },
  { key: 'computer_repair', label: 'Computer repair shops', query: 'computer repair' },
  { key: 'photographer', label: 'Photographers', query: 'photographer' },
  { key: 'tutor', label: 'Tutors', query: 'tutoring centre tutor' },
]
export const categoryLabel = (k: string) => UK_CATEGORIES.find(c => c.key === k)?.label || k

export const UK_REGIONS: Record<string, string[]> = {
  'West Midlands': ['Birmingham', 'Wolverhampton', 'Coventry', 'Solihull', 'Dudley', 'Walsall', 'West Bromwich', 'Sutton Coldfield', 'Stourbridge', 'Halesowen', 'Redditch', 'Kidderminster', 'Stoke-on-Trent', 'Telford', 'Worcester'],
  'East Midlands': ['Nottingham', 'Leicester', 'Derby', 'Northampton', 'Lincoln', 'Mansfield', 'Loughborough', 'Chesterfield', 'Kettering'],
  'Greater London': ['London', 'Croydon', 'Bromley', 'Harrow', 'Ealing', 'Enfield', 'Romford', 'Ilford', 'Wembley', 'Kingston upon Thames', 'Hounslow', 'Barnet'],
  'South East': ['Reading', 'Slough', 'Milton Keynes', 'Oxford', 'Southampton', 'Portsmouth', 'Brighton', 'Maidstone', 'Crawley', 'Guildford', 'Basingstoke', 'Luton'],
  'East of England': ['Cambridge', 'Peterborough', 'Norwich', 'Ipswich', 'Chelmsford', 'Colchester', 'Southend-on-Sea', 'Watford', 'Stevenage'],
  'South West': ['Bristol', 'Plymouth', 'Exeter', 'Swindon', 'Gloucester', 'Cheltenham', 'Bath', 'Bournemouth', 'Poole', 'Taunton'],
  'North West': ['Manchester', 'Liverpool', 'Bolton', 'Stockport', 'Preston', 'Oldham', 'Rochdale', 'Wigan', 'Warrington', 'Blackburn', 'Blackpool', 'Salford', 'Bury', 'Chester'],
  'Yorkshire': ['Leeds', 'Sheffield', 'Bradford', 'York', 'Hull', 'Huddersfield', 'Wakefield', 'Doncaster', 'Rotherham', 'Barnsley', 'Halifax', 'Harrogate'],
  'North East': ['Newcastle upon Tyne', 'Sunderland', 'Middlesbrough', 'Gateshead', 'Durham', 'Darlington', 'Hartlepool'],
  'Scotland': ['Glasgow', 'Edinburgh', 'Aberdeen', 'Dundee', 'Paisley', 'East Kilbride', 'Livingston'],
  'Wales': ['Cardiff', 'Swansea', 'Newport', 'Wrexham', 'Barry'],
  'Northern Ireland': ['Belfast', 'Derry', 'Lisburn', 'Newry'],
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
