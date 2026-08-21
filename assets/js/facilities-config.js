export const LANGUAGES_SPOKEN = [
  'Dhivehi', 'English', 'Hindi', 'Bengali', 'Sinhala', 'Arabic', 'Chinese',
  'French', 'German', 'Italian', 'Russian', 'Spanish', 'Japanese', 'Korean'
];

const languages = { label: 'Languages spoken', items: LANGUAGES_SPOKEN };

export const FACILITY_GROUPS = {
  accommodation: [
    { label: 'Outdoors', items: ['Beachfront', 'Private beach area', 'Garden', 'Terrace', 'Sun terrace', 'Outdoor furniture', 'Picnic area', 'BBQ facilities'] },
    { label: 'Bathroom', items: ['Private bathroom', 'Shower', 'Toilet', 'Toilet paper', 'Towels', 'Free toiletries', 'Hairdryer', 'Bidet', 'Bathrobe', 'Slippers'] },
    { label: 'Bedroom', items: ['Linen', 'Wardrobe or closet', 'Alarm clock', 'Extra-long beds'] },
    { label: 'Room amenities', items: ['Air conditioning', 'Fan', 'Desk', 'Socket near the bed', 'Clothes rack', 'Iron', 'Soundproofing', 'Safety deposit box'] },
    { label: 'Media & technology', items: ['Flat-screen TV', 'Television', 'Cable channels', 'Satellite channels', 'Streaming service', 'Telephone'] },
    { label: 'Kitchen / refreshments', items: ['Electric kettle', 'Coffee machine', 'Refrigerator', 'Tea/coffee maker', 'Dining table'] },
    { label: 'Food & drink', items: ['Breakfast', 'Breakfast available', 'Breakfast in the room', 'Restaurant', 'Coffee house', 'Minibar', "Kids' meals", 'Special diet meals on request', 'Packed lunches'] },
    { label: 'Internet', items: ['Free Wi-Fi', 'Wi-Fi in all areas'] },
    { label: 'Front desk', items: ['24-hour front desk', 'Concierge service', 'Luggage storage', 'Tour desk', 'Currency exchange', 'Express check-in/check-out', 'Invoice provided', 'Room service'] },
    { label: 'Cleaning', items: ['Daily housekeeping', 'Laundry', 'Ironing service', 'Dry cleaning'] },
    { label: 'Safety & security', items: ['Fire extinguishers', 'Smoke alarms', 'CCTV in common areas', 'CCTV outside property', 'Security alarm', 'Key access', 'Key card access', '24-hour security', 'Safety deposit box'] },
    { label: 'Transport', items: ['Airport shuttle', 'Airport pickup', 'Airport drop-off', 'Shuttle service', 'Bicycle rental'] },
    { label: 'Parking', items: ['Free parking', 'Private parking', 'Street parking', 'Accessible parking'] },
    { label: 'Accessibility', items: ['Wheelchair accessible', 'Ground-floor rooms', 'Elevator', 'Upper floors accessible by elevator', 'Accessible bathroom'] },
    { label: 'Family friendly', items: ['Family rooms', 'Cots available', "Children's high chair", "Kids' meals", "Children's playground", 'Non-smoking rooms'] },
    languages
  ],
  diving: [
    { label: 'Diving equipment', items: ['Full diving equipment available', 'BCD rental', 'Regulator rental', 'Mask rental', 'Fins rental', 'Wetsuit rental', 'Dive computer rental', 'Weight belts', 'Diving tanks', 'Dive torch', 'Surface marker buoy', 'Full equipment rental'] },
    { label: 'Tanks & gas', items: ['Air fills', 'Nitrox fills', 'Nitrox available', 'Nitrox analyser', '12L tanks', '15L tanks', 'DIN valves', 'Yoke valves', 'On-site compressor'] },
    { label: 'Training', items: ['Discover Scuba Diving', 'Beginner courses', 'Advanced courses', 'Specialty courses', 'Refresher dives', 'Private instructor', 'Certified dive instructor', 'Certified instructors', 'Beginner friendly', 'Classroom/theory area'] },
    { label: 'Dive boat', items: ['Dive boat', 'Dedicated dive boat', 'Traditional dhoni', 'Speedboat', 'Shaded seating', 'Equipment racks', 'Easy-entry ladder', 'Freshwater rinse', 'Toilet onboard', 'Dry storage', 'Drinking water onboard'] },
    { label: 'Dive centre facilities', items: ['Equipment storage', 'Equipment rinse area', 'Equipment drying area', 'Changing room', 'Shower', 'Toilet', 'Lockers', 'Camera rinse tank', 'Guest waiting area'] },
    { label: 'Safety', items: ['Emergency oxygen', 'First aid kit', 'VHF radio', 'GPS', 'Emergency communication', 'Trained rescue staff', 'Life jackets', 'Fire extinguisher', 'Emergency action plan'] },
    { label: 'Guest services', items: ['Hotel pickup', 'Hotel drop-off', 'Equipment transport', 'Private dive guide', 'Photography service', 'Video service', 'Towels', 'Drinking water', 'Small groups', 'Small group diving'] },
    languages
  ],
  snorkelling: [
    { label: 'Equipment', items: ['Snorkelling equipment included', 'Mask included', 'Snorkel included', 'Fins included', 'Life jackets', "Children's life jackets", 'Rash guards', 'Towels', 'Underwater camera rental'] },
    { label: 'Boat facilities', items: ['Speedboat', 'Traditional dhoni', 'Shaded seating', 'Comfortable seating', 'Toilet onboard', 'Freshwater shower', 'Swim ladder', 'Dry storage', 'USB charging'] },
    { label: 'Guide & experience', items: ['Local guide', 'Snorkelling guide', 'Marine guide', 'Private guide available', 'Small groups', 'Small group experience', 'Private trip available', 'Family friendly', 'Child friendly'] },
    { label: 'Transport', items: ['Hotel pickup', 'Hotel drop-off', 'Jetty pickup', 'Airport pickup', 'Private transfer available'] },
    { label: 'Food & drink', items: ['Drinking water', 'Soft drinks', 'Snacks', 'Fruit', 'Lunch included', 'Picnic included'] },
    { label: 'Safety', items: ['First aid kit', 'Life jackets', "Children's life jackets", 'VHF radio', 'GPS', 'Emergency communication', 'Life ring', 'Trained crew', 'Fire extinguisher'] },
    { label: 'Convenience', items: ['Towels', 'Waterproof storage', 'Dry bags', 'Photography available', 'Video available'] },
    languages
  ],
  excursion: [
    { label: 'Trip type', items: ['Private trip available', 'Shared trip', 'Small groups', 'Family friendly', 'Child friendly', 'Guided experience', 'Local guide'] },
    { label: 'Transport', items: ['Speedboat', 'Traditional dhoni', 'Hotel pickup', 'Hotel drop-off', 'Jetty pickup'] },
    { label: 'Onboard facilities', items: ['Shaded seating', 'Comfortable seating', 'Toilet onboard', 'Freshwater shower', 'Swim ladder', 'Dry storage', 'USB charging'] },
    { label: 'Included equipment', items: ['Snorkelling equipment', 'Life jackets', 'Towels', 'Dry bags', 'Waterproof storage'] },
    { label: 'Food & drink', items: ['Drinking water', 'Soft drinks', 'Snacks', 'Fruit', 'Lunch included', 'Picnic included'] },
    { label: 'Safety', items: ['First aid kit', 'Life jackets', 'VHF radio', 'GPS', 'Emergency communication', 'Fire extinguisher', 'Trained crew'] },
    { label: 'Experience services', items: ['Photography available', 'Video available', 'Private guide', 'Local guide', 'Island guide', 'Educational commentary'] },
    languages
  ],
  fishing: [
    { label: 'Fishing styles', items: ['Bottom fishing', 'Night fishing', 'Trolling', 'Big-game fishing', 'Jigging', 'Popping', 'Handline fishing', 'Traditional Maldivian fishing', 'Catch and release available'] },
    { label: 'Equipment', items: ['Fishing equipment included', 'Fishing rods', 'Fishing reels', 'Handlines', 'Tackle', 'Bait included', 'Artificial lures', 'Fish finder', 'GPS', 'Ice box', 'Fish storage'] },
    { label: 'Boat facilities', items: ['Speedboat', 'Fishing dhoni', 'Shaded seating', 'Rod holders', 'Toilet onboard', 'Comfortable seating', 'Dry storage', 'Swim ladder'] },
    { label: 'Safety', items: ['Life jackets', 'First aid kit', 'VHF radio', 'GPS navigation', 'Emergency communication', 'Fire extinguisher', 'Trained crew'] },
    { label: 'Food & drink', items: ['Drinking water', 'Soft drinks', 'Snacks', 'Fruit', 'Meals available'] },
    { label: 'Guest services', items: ['Hotel pickup', 'Hotel drop-off', 'Private charter', 'Private charter available', 'Local fishing guide', 'Fishing guide', 'Fish cleaning', 'Fish cleaning available', 'Fish preparation arrangement', 'Photography available'] },
    languages
  ],
  watersports: [
    { label: 'Activities / equipment', items: ['Kayak', 'Stand-up paddleboard', 'Jet ski', 'Windsurfing', 'Kitesurfing', 'Wakeboarding', 'Water skiing', 'Banana boat', 'Fun tube', 'Catamaran', 'Pedal boat', 'Canoe', 'Transparent kayak'] },
    { label: 'Equipment', items: ['Equipment included', 'Equipment rental', 'Life jackets', "Children's life jackets", 'Helmets', 'Harnesses', 'Wetsuits', 'Rash guards'] },
    { label: 'Instruction', items: ['Beginner instruction', 'Certified instructor', 'Private instructor', 'Safety briefing', 'Guided session'] },
    { label: 'Shore facilities', items: ['Changing room', 'Shower', 'Toilet', 'Lockers', 'Equipment storage', 'Equipment rinse area', 'Shaded waiting area', 'Beach access'] },
    { label: 'Safety', items: ['First aid kit', 'Life jackets', 'Rescue boat', 'Emergency communication', 'Trained safety staff', 'Safety briefing'] },
    { label: 'Guest services', items: ['Hotel pickup', 'Hotel drop-off', 'Towels', 'Drinking water', 'Photography available', 'Family friendly', 'Child friendly'] },
    languages
  ],
  food_dining: [
    { label: 'Dining areas', items: ['Indoor seating', 'Outdoor seating', 'Beachfront seating', 'Sea-view seating', 'Rooftop seating', 'Air-conditioned seating', 'Family seating', 'Large-group seating'] },
    { label: 'Meals', items: ['Breakfast', 'Lunch', 'Dinner', 'Brunch', 'Snacks', 'Desserts', 'Coffee', 'Fresh juices'] },
    { label: 'Dietary options', items: ['Vegetarian options', 'Vegan options', 'Gluten-free options', "Children's menu", 'Special diet meals on request'] },
    { label: 'Service options', items: ['Dine-in', 'Takeaway', 'Delivery', 'Table service', 'Reservations accepted', 'Group reservations', 'Catering available'] },
    { label: 'Family facilities', items: ["Children's high chairs", "Children's menu", 'Family friendly', 'Baby changing area'] },
    { label: 'Convenience', items: ['Free Wi-Fi', 'Customer toilet', 'Wheelchair accessible', 'Card payment accepted', 'Cash payment accepted', 'Charging points'] },
    languages
  ],
  transfer: [
    { label: 'Transfer types', items: ['Private transfer', 'Shared transfer', 'Scheduled transfer', 'Airport transfer', 'Inter-island transfer', 'Resort transfer', 'Charter transfer'] },
    { label: 'Vessel facilities', items: ['Covered seating', 'Open-air seating', 'Air-conditioned cabin', 'Toilet onboard', 'USB charging', 'Luggage storage', 'Dry storage', 'Easy boarding', 'Swim ladder'] },
    { label: 'Passenger services', items: ['Airport pickup', 'Airport drop-off', 'Airport representative', 'Meet and greet', 'Luggage assistance', 'Hotel pickup', 'Hotel drop-off', 'Child assistance', 'Group transfer'] },
    { label: 'Safety', items: ['Life jackets', 'Adult life jackets', "Children's life jackets", 'First aid kit', 'GPS navigation', 'VHF radio', 'Emergency communication', 'Fire extinguisher', 'Navigation lights', 'Trained crew'] },
    { label: 'Comfort', items: ['Drinking water', 'Towels', 'Shaded seating', 'Cushioned seating', 'Charging ports'] },
    languages
  ],
  conservation_experience: [
    { label: 'Experience types', items: ['Coral restoration', 'Coral nursery visit', 'Reef monitoring', 'Marine biology activity', 'Beach cleanup', 'Marine debris activity', 'Mangrove activity', 'Environmental workshop', 'Citizen science activity'] },
    { label: 'Equipment', items: ['Snorkelling equipment', 'Life jackets', 'Gloves', 'Cleanup equipment', 'Monitoring equipment', 'Educational materials', 'Field equipment', 'Underwater slate'] },
    { label: 'Guidance', items: ['Conservation guide', 'Marine educator', 'Local community guide', 'Practical demonstration', 'Educational briefing', 'Guided field activity'] },
    { label: 'Facilities', items: ['Classroom/briefing area', 'Changing area', 'Shower', 'Toilet', 'Equipment storage', 'Shaded meeting area'] },
    { label: 'Safety', items: ['First aid kit', 'Safety briefing', 'Life jackets', 'Emergency communication', 'Trained guide'] },
    { label: 'Guest services', items: ['Drinking water', 'Towels', 'Hotel pickup', 'Family friendly', 'Student groups welcome', 'Private groups available'] },
    languages
  ],
  community_experience: [
    { label: 'Experience types', items: ['Local island tour', 'Cultural tour', 'Community visit', 'Traditional craft activity', 'Local cooking experience', 'Maldivian history experience', 'Traditional music experience', 'Local livelihood experience', 'Environmental activity'] },
    { label: 'Guide services', items: ['Local community guide', 'English-speaking guide', 'Private guide available', 'Small groups', 'Educational commentary'] },
    { label: 'Family & groups', items: ['Family friendly', 'Child friendly', 'School groups welcome', 'Private groups available', 'Large groups accepted'] },
    { label: 'Convenience', items: ['Drinking water', 'Refreshments', 'Rest area', 'Toilet access', 'Shaded area', 'Hotel pickup', 'Hotel drop-off'] },
    { label: 'Accessibility', items: ['Wheelchair accessible', 'Limited-mobility assistance', 'Seating available'] },
    languages
  ],
  other: [
    { label: 'Customer facilities', items: ['Customer waiting area', 'Toilet', 'Changing room', 'Shower', 'Lockers', 'Free Wi-Fi', 'Charging points'] },
    { label: 'Transport', items: ['Hotel pickup', 'Hotel drop-off', 'Airport pickup', 'Private transport', 'Shared transport'] },
    { label: 'Equipment', items: ['Equipment provided', 'Equipment rental', 'Safety equipment', 'Waterproof storage'] },
    { label: 'Food & drink', items: ['Drinking water', 'Refreshments', 'Snacks', 'Meals available'] },
    { label: 'Accessibility', items: ['Wheelchair accessible', 'Limited-mobility assistance', 'Family friendly', 'Child friendly'] },
    { label: 'Safety', items: ['First aid kit', 'Emergency communication', 'Trained staff', 'Safety briefing'] },
    languages
  ]
};

export const POPULAR_FACILITIES = {
  accommodation: ['Free Wi-Fi', 'Air conditioning', 'Beachfront', 'Breakfast available', 'Restaurant', 'Airport shuttle', 'Family rooms', 'Non-smoking rooms', 'Room service', '24-hour front desk'],
  diving: ['Full diving equipment available', 'Dive boat', 'Certified dive instructor', 'Nitrox available', 'Beginner friendly', 'Hotel pickup', 'Emergency oxygen', 'Small groups'],
  snorkelling: ['Snorkelling equipment included', 'Life jackets', 'Local guide', 'Hotel pickup', 'Drinking water', 'Speedboat', 'Family friendly', 'Small groups'],
  excursion: ['Snorkelling equipment', 'Life jackets', 'Local guide', 'Hotel pickup', 'Drinking water', 'Private trip available'],
  fishing: ['Fishing equipment included', 'Bait included', 'Local fishing guide', 'Private charter available', 'Drinking water', 'Life jackets', 'Fish cleaning available'],
  watersports: ['Equipment included', 'Life jackets', 'Beginner instruction', 'Certified instructor', 'Safety briefing', 'Hotel pickup', 'Drinking water', 'Family friendly'],
  food_dining: ['Breakfast', 'Lunch', 'Dinner', 'Outdoor seating', 'Air-conditioned seating', 'Takeaway', 'Vegetarian options', 'Free Wi-Fi'],
  transfer: ['Airport pickup', 'Airport drop-off', 'Private transfer', 'Shared transfer', 'Air-conditioned cabin', 'Luggage assistance', 'Life jackets', 'Drinking water'],
  conservation_experience: ['Conservation guide', 'Educational briefing', 'Safety briefing', 'First aid kit', 'Drinking water', 'Family friendly'],
  community_experience: ['Local community guide', 'Small groups', 'Family friendly', 'Educational commentary', 'Drinking water', 'Hotel pickup'],
  other: ['Customer waiting area', 'Free Wi-Fi', 'Hotel pickup', 'Equipment provided', 'First aid kit', 'Wheelchair accessible']
};

export const OPERATOR_LISTING_DEFAULTS = {
  guesthouse_hotel: ['accommodation'],
  dive_centre: ['diving', 'snorkelling', 'excursion'],
  snorkelling_excursion: ['snorkelling', 'excursion'],
  fishing_operator: ['fishing', 'excursion'],
  watersports_provider: ['watersports'],
  restaurant_cafe: ['food_dining'],
  speedboat_transfer: ['transfer'],
  conservation_community: ['conservation_experience', 'community_experience'],
  other_tourism_service: ['other']
};

export const FACILITY_HEADINGS = {
  accommodation: 'Facilities & Amenities',
  diving: 'Diving Facilities & Services',
  snorkelling: 'Snorkelling Facilities & Services',
  excursion: 'Excursion Facilities & Services',
  fishing: 'Fishing Facilities & Services',
  watersports: 'Watersports Facilities & Services',
  food_dining: 'Restaurant Facilities & Services',
  transfer: 'Transfer Facilities & Services',
  conservation_experience: 'Conservation Experience Facilities & Services',
  community_experience: 'Community Experience Facilities & Services',
  other: 'Facilities & Services'
};

export const PUBLIC_FACILITY_HEADINGS = {
  accommodation: (listing) => `Facilities of ${listing.title}`,
  diving: () => 'Diving facilities & services',
  snorkelling: () => 'Snorkelling facilities & services',
  excursion: () => 'Excursion facilities & services',
  fishing: () => 'Fishing equipment & services',
  watersports: () => 'Watersports facilities & services',
  food_dining: () => 'Restaurant facilities & services',
  transfer: () => 'Transfer facilities & onboard features',
  conservation_experience: () => "Experience facilities & what's provided",
  community_experience: () => "Experience facilities & what's provided",
  other: () => 'Facilities & services'
};

// Aliases are used only for matching and de-duplication; stored labels remain readable.
export const FACILITY_ALIASES = {
  wifi: 'free wi fi',
  'wi fi': 'free wi fi',
  'free wifi': 'free wi fi',
  'free wi fi': 'free wi fi',
  'full equipment': 'full diving equipment available',
  nitrox: 'nitrox available'
};
