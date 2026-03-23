import { AppDataSource } from "../config/database.js";
import { Embassy } from "../entities/Embassy.js";
import { Region, ThreatLevel } from "../entities/enums.js";

interface EmbassySeed {
  name: string;
  city: string;
  country: string;
  region: Region;
  latitude: number;
  longitude: number;
  address: string;
}

const embassies: EmbassySeed[] = [
  // ===== AFRICA =====
  { name: "U.S. Embassy Nairobi", city: "Nairobi", country: "Kenya", region: Region.AFRICA, latitude: -1.2921, longitude: 36.8219, address: "United Nations Avenue, Nairobi" },
  { name: "U.S. Embassy Pretoria", city: "Pretoria", country: "South Africa", region: Region.AFRICA, latitude: -25.7479, longitude: 28.2293, address: "877 Pretorius Street, Pretoria" },
  { name: "U.S. Embassy Addis Ababa", city: "Addis Ababa", country: "Ethiopia", region: Region.AFRICA, latitude: 9.0054, longitude: 38.7636, address: "Entoto Street, Addis Ababa" },
  { name: "U.S. Embassy Lagos", city: "Lagos", country: "Nigeria", region: Region.AFRICA, latitude: 6.4614, longitude: 3.4066, address: "2 Walter Carrington Crescent, Lagos" },
  { name: "U.S. Embassy Abuja", city: "Abuja", country: "Nigeria", region: Region.AFRICA, latitude: 9.0579, longitude: 7.4951, address: "1075 Diplomatic Drive, Abuja" },
  { name: "U.S. Embassy Accra", city: "Accra", country: "Ghana", region: Region.AFRICA, latitude: 5.5571, longitude: -0.1753, address: "No. 24, Fourth Circular Road, Cantonments, Accra" },
  { name: "U.S. Embassy Dar es Salaam", city: "Dar es Salaam", country: "Tanzania", region: Region.AFRICA, latitude: -6.7740, longitude: 39.2457, address: "686 Old Bagamoyo Road, Dar es Salaam" },
  { name: "U.S. Embassy Dakar", city: "Dakar", country: "Senegal", region: Region.AFRICA, latitude: 14.6928, longitude: -17.4467, address: "Route des Almadies, Dakar" },
  { name: "U.S. Embassy Kinshasa", city: "Kinshasa", country: "Democratic Republic of the Congo", region: Region.AFRICA, latitude: -4.3098, longitude: 15.3134, address: "310 Avenue des Aviateurs, Kinshasa" },

  // ===== EAST ASIA & PACIFIC =====
  { name: "U.S. Embassy Tokyo", city: "Tokyo", country: "Japan", region: Region.EAST_ASIA_PACIFIC, latitude: 35.6654, longitude: 139.7413, address: "1-10-5 Akasaka, Minato-ku, Tokyo" },
  { name: "U.S. Embassy Beijing", city: "Beijing", country: "China", region: Region.EAST_ASIA_PACIFIC, latitude: 39.9533, longitude: 116.4649, address: "55 An Jia Lou Road, Beijing" },
  { name: "U.S. Embassy Seoul", city: "Seoul", country: "South Korea", region: Region.EAST_ASIA_PACIFIC, latitude: 37.5326, longitude: 126.9985, address: "188 Sejong-daero, Jongno-gu, Seoul" },
  { name: "U.S. Embassy Canberra", city: "Canberra", country: "Australia", region: Region.EAST_ASIA_PACIFIC, latitude: -35.3048, longitude: 149.1252, address: "Moonah Place, Yarralumla, Canberra" },
  { name: "U.S. Embassy Manila", city: "Manila", country: "Philippines", region: Region.EAST_ASIA_PACIFIC, latitude: 14.5595, longitude: 120.9867, address: "1201 Roxas Boulevard, Manila" },
  { name: "U.S. Embassy Bangkok", city: "Bangkok", country: "Thailand", region: Region.EAST_ASIA_PACIFIC, latitude: 13.7434, longitude: 100.5488, address: "95 Wireless Road, Bangkok" },
  { name: "U.S. Embassy Jakarta", city: "Jakarta", country: "Indonesia", region: Region.EAST_ASIA_PACIFIC, latitude: -6.1826, longitude: 106.8318, address: "Jl. Medan Merdeka Selatan No.3-5, Jakarta" },
  { name: "U.S. Embassy Hanoi", city: "Hanoi", country: "Vietnam", region: Region.EAST_ASIA_PACIFIC, latitude: 21.0185, longitude: 105.8491, address: "7 Lang Ha Street, Hanoi" },
  { name: "U.S. Embassy Wellington", city: "Wellington", country: "New Zealand", region: Region.EAST_ASIA_PACIFIC, latitude: -41.2829, longitude: 174.7762, address: "29 Fitzherbert Terrace, Wellington" },

  // ===== EUROPE & EURASIA =====
  { name: "U.S. Embassy London", city: "London", country: "United Kingdom", region: Region.EUROPE_EURASIA, latitude: 51.4822, longitude: -0.0894, address: "33 Nine Elms Lane, London" },
  { name: "U.S. Embassy Paris", city: "Paris", country: "France", region: Region.EUROPE_EURASIA, latitude: 48.8619, longitude: 2.3013, address: "2 Avenue Gabriel, Paris" },
  { name: "U.S. Embassy Berlin", city: "Berlin", country: "Germany", region: Region.EUROPE_EURASIA, latitude: 52.5163, longitude: 13.3827, address: "Pariser Platz 2, Berlin" },
  { name: "U.S. Embassy Rome", city: "Rome", country: "Italy", region: Region.EUROPE_EURASIA, latitude: 41.9198, longitude: 12.4933, address: "Via Vittorio Veneto 121, Rome" },
  { name: "U.S. Embassy Madrid", city: "Madrid", country: "Spain", region: Region.EUROPE_EURASIA, latitude: 40.4530, longitude: -3.6883, address: "Calle de Serrano 75, Madrid" },
  { name: "U.S. Embassy Kyiv", city: "Kyiv", country: "Ukraine", region: Region.EUROPE_EURASIA, latitude: 50.4404, longitude: 30.5101, address: "4 A.I. Sikorsky Street, Kyiv" },
  { name: "U.S. Embassy Warsaw", city: "Warsaw", country: "Poland", region: Region.EUROPE_EURASIA, latitude: 52.2298, longitude: 21.0118, address: "Aleje Ujazdowskie 29/31, Warsaw" },
  { name: "U.S. Embassy Ankara", city: "Ankara", country: "Turkey", region: Region.EUROPE_EURASIA, latitude: 39.9208, longitude: 32.8597, address: "110 Ataturk Boulevard, Ankara" },
  { name: "U.S. Embassy Moscow", city: "Moscow", country: "Russia", region: Region.EUROPE_EURASIA, latitude: 55.7525, longitude: 37.5802, address: "Bolshoy Devyatinskiy Pereulok 8, Moscow" },

  // ===== NEAR EAST =====
  { name: "U.S. Embassy Tel Aviv", city: "Tel Aviv", country: "Israel", region: Region.NEAR_EAST, latitude: 32.0700, longitude: 34.7844, address: "71 HaYarkon Street, Tel Aviv" },
  { name: "U.S. Embassy Riyadh", city: "Riyadh", country: "Saudi Arabia", region: Region.NEAR_EAST, latitude: 24.6829, longitude: 46.6895, address: "Collector Road M, Riyadh" },
  { name: "U.S. Embassy Abu Dhabi", city: "Abu Dhabi", country: "United Arab Emirates", region: Region.NEAR_EAST, latitude: 24.4244, longitude: 54.4340, address: "Embassies District, Abu Dhabi" },
  { name: "U.S. Embassy Amman", city: "Amman", country: "Jordan", region: Region.NEAR_EAST, latitude: 31.9539, longitude: 35.8650, address: "Al-Umayyaween Street, Amman" },
  { name: "U.S. Embassy Baghdad", city: "Baghdad", country: "Iraq", region: Region.NEAR_EAST, latitude: 33.2981, longitude: 44.3862, address: "Al-Kindi Street, International Zone, Baghdad" },
  { name: "U.S. Embassy Cairo", city: "Cairo", country: "Egypt", region: Region.NEAR_EAST, latitude: 30.0503, longitude: 31.2328, address: "5 Tawfik Diab Street, Garden City, Cairo" },
  { name: "U.S. Embassy Doha", city: "Doha", country: "Qatar", region: Region.NEAR_EAST, latitude: 25.3227, longitude: 51.4927, address: "22nd February Street, Doha" },
  { name: "U.S. Embassy Beirut", city: "Beirut", country: "Lebanon", region: Region.NEAR_EAST, latitude: 33.8648, longitude: 35.5269, address: "Awkar, Facing the Municipality, Beirut" },
  { name: "U.S. Embassy Kuwait City", city: "Kuwait City", country: "Kuwait", region: Region.NEAR_EAST, latitude: 29.2998, longitude: 47.9735, address: "Al-Masjid Al-Aqsa Street, Bayan, Kuwait" },

  // ===== SOUTH & CENTRAL ASIA =====
  { name: "U.S. Embassy New Delhi", city: "New Delhi", country: "India", region: Region.SOUTH_CENTRAL_ASIA, latitude: 28.5978, longitude: 77.1990, address: "Shantipath, Chanakyapuri, New Delhi" },
  { name: "U.S. Embassy Islamabad", city: "Islamabad", country: "Pakistan", region: Region.SOUTH_CENTRAL_ASIA, latitude: 33.7270, longitude: 73.0901, address: "Diplomatic Enclave, Ramna 5, Islamabad" },
  { name: "U.S. Embassy Kabul", city: "Kabul", country: "Afghanistan", region: Region.SOUTH_CENTRAL_ASIA, latitude: 34.5281, longitude: 69.1723, address: "Great Massoud Road, Kabul" },
  { name: "U.S. Embassy Colombo", city: "Colombo", country: "Sri Lanka", region: Region.SOUTH_CENTRAL_ASIA, latitude: 6.9183, longitude: 79.8550, address: "210 Galle Road, Colombo 03" },
  { name: "U.S. Embassy Dhaka", city: "Dhaka", country: "Bangladesh", region: Region.SOUTH_CENTRAL_ASIA, latitude: 23.7903, longitude: 90.4076, address: "Madani Avenue, Baridhara, Dhaka" },
  { name: "U.S. Embassy Kathmandu", city: "Kathmandu", country: "Nepal", region: Region.SOUTH_CENTRAL_ASIA, latitude: 27.7385, longitude: 85.3351, address: "Maharajgunj, Kathmandu" },
  { name: "U.S. Embassy Nur-Sultan", city: "Astana", country: "Kazakhstan", region: Region.SOUTH_CENTRAL_ASIA, latitude: 51.1300, longitude: 71.4227, address: "Rakhymzhan Koshkarbayev Avenue 3, Astana" },
  { name: "U.S. Embassy Tashkent", city: "Tashkent", country: "Uzbekistan", region: Region.SOUTH_CENTRAL_ASIA, latitude: 41.3545, longitude: 69.3172, address: "3 Moyqorghon Street, Tashkent" },

  // ===== WESTERN HEMISPHERE =====
  { name: "U.S. Embassy Ottawa", city: "Ottawa", country: "Canada", region: Region.WESTERN_HEMISPHERE, latitude: 45.4380, longitude: -75.6930, address: "490 Sussex Drive, Ottawa" },
  { name: "U.S. Embassy Mexico City", city: "Mexico City", country: "Mexico", region: Region.WESTERN_HEMISPHERE, latitude: 19.4326, longitude: -99.1860, address: "Paseo de la Reforma 305, Mexico City" },
  { name: "U.S. Embassy Brasilia", city: "Brasilia", country: "Brazil", region: Region.WESTERN_HEMISPHERE, latitude: -15.8025, longitude: -47.8861, address: "SES Av. das Nacoes, Quadra 801, Lote 3, Brasilia" },
  { name: "U.S. Embassy Bogota", city: "Bogota", country: "Colombia", region: Region.WESTERN_HEMISPHERE, latitude: 4.6391, longitude: -74.0676, address: "Calle 24 Bis No. 48-50, Bogota" },
  { name: "U.S. Embassy Lima", city: "Lima", country: "Peru", region: Region.WESTERN_HEMISPHERE, latitude: -12.0932, longitude: -77.0470, address: "Avenida La Encalada, Surco, Lima" },
  { name: "U.S. Embassy Buenos Aires", city: "Buenos Aires", country: "Argentina", region: Region.WESTERN_HEMISPHERE, latitude: -34.5880, longitude: -58.4009, address: "Avenida Colombia 4300, Buenos Aires" },
  { name: "U.S. Embassy Santiago", city: "Santiago", country: "Chile", region: Region.WESTERN_HEMISPHERE, latitude: -33.4231, longitude: -70.6187, address: "Avenida Andres Bello 2800, Santiago" },
  { name: "U.S. Embassy Panama City", city: "Panama City", country: "Panama", region: Region.WESTERN_HEMISPHERE, latitude: 9.1028, longitude: -79.5362, address: "Building 783, Demetrio Basilio Lakas Avenue, Panama City" },
  { name: "U.S. Embassy Havana", city: "Havana", country: "Cuba", region: Region.WESTERN_HEMISPHERE, latitude: 23.1478, longitude: -82.3586, address: "Calzada between L & M Streets, Vedado, Havana" },
];

export async function seedEmbassies() {
  const repo = AppDataSource.getRepository(Embassy);
  const existing = await repo.count();
  if (existing > 0) {
    console.log(`  Embassies: ${existing} already exist, skipping.`);
    return;
  }

  const entities = embassies.map((e) =>
    repo.create({ ...e, currentThreatLevel: ThreatLevel.LOW }),
  );

  await repo.save(entities);
  console.log(`  Embassies: seeded ${entities.length} locations.`);
}
