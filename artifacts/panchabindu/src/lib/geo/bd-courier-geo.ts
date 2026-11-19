// src/lib/geo/bd-courier-geo.ts
// Bangladesh 64-District & 607-Upazila/Thana Postal Code + Pathao City/Zone/Area Auto-Sync Registry
// Companion module to bd-geocode.ts (never modifies bd-geocode.ts generated arrays).

import { BD_DISTRICTS, BD_UPAZILAS, getDistrictById, getUpazilaById } from './bd-geocode';

export interface DistrictCourierGeoMeta {
  districtId: number;
  defaultPostCode: string;
  pathaoCity: string;
  defaultZone: string;
  subPostOffices: Array<{ code: string; nameEn: string; nameBn: string }>;
}

export interface ResolvedCourierGeoDefaults {
  postCode: string;
  recipientCity: string;
  recipientZone: string;
  recipientArea: string;
  confidence: 'exact_thana' | 'street_inferred' | 'district_fallback';
}

export const DISTRICT_COURIER_META: Record<number, DistrictCourierGeoMeta> = {
  1: {
    districtId: 1,
    defaultPostCode: '3500',
    pathaoCity: 'Cumilla',
    defaultZone: 'Cumilla Sadar',
    subPostOffices: [
      { code: '3500', nameEn: 'Cumilla Head Post Office', nameBn: 'কুমিল্লা প্রধান ডাকঘর' },
      { code: '3501', nameEn: 'Cumilla Sadar South', nameBn: 'কুমিল্লা সদর দক্ষিণ' },
      { code: '3502', nameEn: 'Mainamati / Lalmai', nameBn: 'ময়নামতি / লালমাই' },
      { code: '3516', nameEn: 'Daudkandi', nameBn: 'দাউদকান্দি' },
      { code: '3570', nameEn: 'Laksam', nameBn: 'লাকসাম' },
    ],
  },
  2: {
    districtId: 2,
    defaultPostCode: '3900',
    pathaoCity: 'Feni',
    defaultZone: 'Feni Sadar',
    subPostOffices: [
      { code: '3900', nameEn: 'Feni Head Post Office', nameBn: 'ফেনী প্রধান ডাকঘর' },
      { code: '3910', nameEn: 'Chhagalnaiya', nameBn: 'ছাগলনাইয়া' },
      { code: '3920', nameEn: 'Daganbhuiyan', nameBn: 'দাগনভূঞা' },
      { code: '3930', nameEn: 'Sonagazi', nameBn: 'সোনাগাজী' },
    ],
  },
  3: {
    districtId: 3,
    defaultPostCode: '3400',
    pathaoCity: 'Brahmanbaria',
    defaultZone: 'Brahmanbaria Sadar',
    subPostOffices: [
      { code: '3400', nameEn: 'Brahmanbaria GPO', nameBn: 'ব্রাহ্মণবাড়িয়া ডাকঘর' },
      { code: '3402', nameEn: 'Ashuganj', nameBn: 'আশুগঞ্জ' },
      { code: '3450', nameEn: 'Akhaura', nameBn: 'আখাউড়া' },
    ],
  },
  4: {
    districtId: 4,
    defaultPostCode: '4500',
    pathaoCity: 'Rangamati',
    defaultZone: 'Rangamati Sadar',
    subPostOffices: [
      { code: '4500', nameEn: 'Rangamati Sadar', nameBn: 'রাঙ্গামাটি সদর' },
      { code: '4530', nameEn: 'Kaptai', nameBn: 'কাপ্তাই' },
    ],
  },
  5: {
    districtId: 5,
    defaultPostCode: '3800',
    pathaoCity: 'Noakhali',
    defaultZone: 'Maijdee / Sadar',
    subPostOffices: [
      { code: '3800', nameEn: 'Noakhali / Maijdee', nameBn: 'মাইজদী / নোয়াখালী সদর' },
      { code: '3820', nameEn: 'Chowmuhani / Begumganj', nameBn: 'চৌমুহনী / বেগমগঞ্জ' },
      { code: '3850', nameEn: 'Basurhat / Companiganj', nameBn: 'বসুরহাট / কোম্পানীগঞ্জ' },
    ],
  },
  6: {
    districtId: 6,
    defaultPostCode: '3600',
    pathaoCity: 'Chandpur',
    defaultZone: 'Chandpur Sadar',
    subPostOffices: [
      { code: '3600', nameEn: 'Chandpur Sadar', nameBn: 'চাঁদপুর সদর' },
      { code: '3610', nameEn: 'Hajiganj', nameBn: 'হাজীগঞ্জ' },
    ],
  },
  7: {
    districtId: 7,
    defaultPostCode: '3700',
    pathaoCity: 'Lakshmipur',
    defaultZone: 'Lakshmipur Sadar',
    subPostOffices: [
      { code: '3700', nameEn: 'Lakshmipur Sadar', nameBn: 'লক্ষ্মীপুর সদর' },
      { code: '3710', nameEn: 'Raipur', nameBn: 'রায়পুর' },
      { code: '3720', nameEn: 'Ramganj', nameBn: 'রামগঞ্জ' },
    ],
  },
  8: {
    districtId: 8,
    defaultPostCode: '4000',
    pathaoCity: 'Chattogram',
    defaultZone: 'Kotwali',
    subPostOffices: [
      { code: '4000', nameEn: 'Chattogram GPO / Kotwali', nameBn: 'চট্টগ্রাম জিপিও / কোতোয়ালী' },
      { code: '4100', nameEn: 'Agrabad / Bandar', nameBn: 'আগ্রাবাদ / বন্দর' },
      { code: '4203', nameEn: 'Panchlaish / Chawkbazar', nameBn: 'পাঁচলাইশ / চকবাজার' },
      { code: '4216', nameEn: 'Halishahar', nameBn: 'হালিশহর' },
      { code: '4225', nameEn: 'Khulshi / GEC', nameBn: 'খুলশী / জিইসি' },
      { code: '4330', nameEn: 'Hathazari', nameBn: 'হাটহাজারী' },
    ],
  },
  9: {
    districtId: 9,
    defaultPostCode: '4700',
    pathaoCity: "Cox's Bazar",
    defaultZone: "Cox's Bazar Sadar",
    subPostOffices: [
      { code: '4700', nameEn: "Cox's Bazar GPO", nameBn: 'কক্সবাজার প্রধান ডাকঘর' },
      { code: '4740', nameEn: 'Chakaria', nameBn: 'চকরিয়া' },
      { code: '4760', nameEn: 'Teknaf', nameBn: 'টেকনাফ' },
    ],
  },
  10: {
    districtId: 10,
    defaultPostCode: '4400',
    pathaoCity: 'Khagrachhari',
    defaultZone: 'Khagrachhari Sadar',
    subPostOffices: [
      { code: '4400', nameEn: 'Khagrachhari Sadar', nameBn: 'খাগড়াছড়ি সদর' },
      { code: '4420', nameEn: 'Dighinala', nameBn: 'দিঘীনালা' },
    ],
  },
  11: {
    districtId: 11,
    defaultPostCode: '4600',
    pathaoCity: 'Bandarban',
    defaultZone: 'Bandarban Sadar',
    subPostOffices: [
      { code: '4600', nameEn: 'Bandarban Sadar', nameBn: 'বান্দরবান সদর' },
      { code: '4641', nameEn: 'Lama', nameBn: 'লামা' },
    ],
  },
  12: {
    districtId: 12,
    defaultPostCode: '6700',
    pathaoCity: 'Sirajganj',
    defaultZone: 'Sirajganj Sadar',
    subPostOffices: [
      { code: '6700', nameEn: 'Sirajganj Sadar', nameBn: 'সিরাজগঞ্জ সদর' },
      { code: '6760', nameEn: 'Ullapara', nameBn: 'উল্লাপাড়া' },
      { code: '6770', nameEn: 'Shahjadpur', nameBn: 'শাহজাদপুর' },
    ],
  },
  13: {
    districtId: 13,
    defaultPostCode: '6600',
    pathaoCity: 'Pabna',
    defaultZone: 'Pabna Sadar',
    subPostOffices: [
      { code: '6600', nameEn: 'Pabna Sadar', nameBn: 'পাবনা সদর' },
      { code: '6620', nameEn: 'Ishurdi', nameBn: 'ঈশ্বরদী' },
    ],
  },
  14: {
    districtId: 14,
    defaultPostCode: '5800',
    pathaoCity: 'Bogura',
    defaultZone: 'Bogura Sadar',
    subPostOffices: [
      { code: '5800', nameEn: 'Bogura Head Post Office', nameBn: 'বগুড়া প্রধান ডাকঘর' },
      { code: '5840', nameEn: 'Sherpur', nameBn: 'শেরপুর' },
      { code: '5890', nameEn: 'Santahar / Adamdighi', nameBn: 'সান্তাহার / আদমদীঘি' },
    ],
  },
  15: {
    districtId: 15,
    defaultPostCode: '6000',
    pathaoCity: 'Rajshahi',
    defaultZone: 'Boalia',
    subPostOffices: [
      { code: '6000', nameEn: 'Rajshahi GPO / Rajpara', nameBn: 'রাজশাহী জিপিও / রাজপাড়া' },
      { code: '6100', nameEn: 'Ghoramara / Boalia', nameBn: 'ঘোড়ামারা / বোয়ালিয়া' },
      { code: '6205', nameEn: 'Rajshahi University / Motihar', nameBn: 'রাবি / মতিহার' },
    ],
  },
  16: {
    districtId: 16,
    defaultPostCode: '6400',
    pathaoCity: 'Natore',
    defaultZone: 'Natore Sadar',
    subPostOffices: [
      { code: '6400', nameEn: 'Natore Sadar', nameBn: 'নাটোর সদর' },
      { code: '6450', nameEn: 'Singra', nameBn: 'সিংড়া' },
    ],
  },
  17: {
    districtId: 17,
    defaultPostCode: '5900',
    pathaoCity: 'Joypurhat',
    defaultZone: 'Joypurhat Sadar',
    subPostOffices: [
      { code: '5900', nameEn: 'Joypurhat Sadar', nameBn: 'জয়পুরহাট সদর' },
      { code: '5910', nameEn: 'Panchbibi', nameBn: 'পাঁচবিবি' },
    ],
  },
  18: {
    districtId: 18,
    defaultPostCode: '6300',
    pathaoCity: 'Chapainawabganj',
    defaultZone: 'Chapainawabganj Sadar',
    subPostOffices: [
      { code: '6300', nameEn: 'Chapainawabganj Sadar', nameBn: 'চাঁপাইনবাবগঞ্জ সদর' },
      { code: '6310', nameEn: 'Shibganj', nameBn: 'শিবগঞ্জ' },
    ],
  },
  19: {
    districtId: 19,
    defaultPostCode: '6500',
    pathaoCity: 'Naogaon',
    defaultZone: 'Naogaon Sadar',
    subPostOffices: [
      { code: '6500', nameEn: 'Naogaon Sadar', nameBn: 'নওগাঁ সদর' },
      { code: '6540', nameEn: 'Patnitala', nameBn: 'পত্নীতলা' },
    ],
  },
  20: {
    districtId: 20,
    defaultPostCode: '7400',
    pathaoCity: 'Jashore',
    defaultZone: 'Jashore Sadar',
    subPostOffices: [
      { code: '7400', nameEn: 'Jashore GPO', nameBn: 'যশোর প্রধান ডাকঘর' },
      { code: '7431', nameEn: 'Benapole / Sharsha', nameBn: 'বেনাপোল / শার্শা' },
      { code: '7460', nameEn: 'Noapara / Abhaynagar', nameBn: 'নওয়াপাড়া / অভয়নগর' },
    ],
  },
  21: {
    districtId: 21,
    defaultPostCode: '9400',
    pathaoCity: 'Satkhira',
    defaultZone: 'Satkhira Sadar',
    subPostOffices: [
      { code: '9400', nameEn: 'Satkhira Sadar', nameBn: 'সাতক্ষীরা সদর' },
      { code: '9410', nameEn: 'Kalaroa', nameBn: 'কলারোয়া' },
    ],
  },
  22: {
    districtId: 22,
    defaultPostCode: '7100',
    pathaoCity: 'Meherpur',
    defaultZone: 'Meherpur Sadar',
    subPostOffices: [
      { code: '7100', nameEn: 'Meherpur Sadar', nameBn: 'মেহেরপুর সদর' },
      { code: '7110', nameEn: 'Gangni', nameBn: 'গাংনী' },
    ],
  },
  23: {
    districtId: 23,
    defaultPostCode: '7500',
    pathaoCity: 'Narail',
    defaultZone: 'Narail Sadar',
    subPostOffices: [{ code: '7500', nameEn: 'Narail Sadar', nameBn: 'নড়াইল সদর' }],
  },
  24: {
    districtId: 24,
    defaultPostCode: '7200',
    pathaoCity: 'Chuadanga',
    defaultZone: 'Chuadanga Sadar',
    subPostOffices: [
      { code: '7200', nameEn: 'Chuadanga Sadar', nameBn: 'চুয়াডাঙ্গা সদর' },
      { code: '7210', nameEn: 'Alamdanga', nameBn: 'আলমডাঙ্গা' },
    ],
  },
  25: {
    districtId: 25,
    defaultPostCode: '7000',
    pathaoCity: 'Kushtia',
    defaultZone: 'Kushtia Sadar',
    subPostOffices: [
      { code: '7000', nameEn: 'Kushtia Sadar', nameBn: 'কুষ্টিয়া সদর' },
      { code: '7040', nameEn: 'Bheramara', nameBn: 'ভেড়ামারা' },
    ],
  },
  26: {
    districtId: 26,
    defaultPostCode: '7600',
    pathaoCity: 'Magura',
    defaultZone: 'Magura Sadar',
    subPostOffices: [{ code: '7600', nameEn: 'Magura Sadar', nameBn: 'মাগুরা সদর' }],
  },
  27: {
    districtId: 27,
    defaultPostCode: '9000',
    pathaoCity: 'Khulna',
    defaultZone: 'Khulna Sadar',
    subPostOffices: [
      { code: '9000', nameEn: 'Khulna GPO / Khalishpur', nameBn: 'খুলনা জিপিও / খালিশপুর' },
      { code: '9100', nameEn: 'Khulna Sadar / Sonadanga', nameBn: 'খুলনা সদর / সোনাডাঙ্গা' },
      { code: '9202', nameEn: 'Daulatpur', nameBn: 'দৌলতপুর' },
    ],
  },
  28: {
    districtId: 28,
    defaultPostCode: '9300',
    pathaoCity: 'Bagerhat',
    defaultZone: 'Bagerhat Sadar',
    subPostOffices: [
      { code: '9300', nameEn: 'Bagerhat Sadar', nameBn: 'বাগেরহাট সদর' },
      { code: '9350', nameEn: 'Mongla', nameBn: 'মোংলা' },
    ],
  },
  29: {
    districtId: 29,
    defaultPostCode: '7300',
    pathaoCity: 'Jhenaidah',
    defaultZone: 'Jhenaidah Sadar',
    subPostOffices: [
      { code: '7300', nameEn: 'Jhenaidah Sadar', nameBn: 'ঝিনাইদহ সদর' },
      { code: '7350', nameEn: 'Kaliganj', nameBn: 'কালীগঞ্জ' },
    ],
  },
  30: {
    districtId: 30,
    defaultPostCode: '8400',
    pathaoCity: 'Jhalakathi',
    defaultZone: 'Jhalakathi Sadar',
    subPostOffices: [{ code: '8400', nameEn: 'Jhalakathi Sadar', nameBn: 'ঝালকাঠি সদর' }],
  },
  31: {
    districtId: 31,
    defaultPostCode: '8600',
    pathaoCity: 'Patuakhali',
    defaultZone: 'Patuakhali Sadar',
    subPostOffices: [
      { code: '8600', nameEn: 'Patuakhali Sadar', nameBn: 'পটুয়াখালী সদর' },
      { code: '8650', nameEn: 'Kalapara / Kuakata', nameBn: 'কলাপাড়া / কুয়াকাটা' },
    ],
  },
  32: {
    districtId: 32,
    defaultPostCode: '8500',
    pathaoCity: 'Pirojpur',
    defaultZone: 'Pirojpur Sadar',
    subPostOffices: [{ code: '8500', nameEn: 'Pirojpur Sadar', nameBn: 'পিরোজপুর সদর' }],
  },
  33: {
    districtId: 33,
    defaultPostCode: '8200',
    pathaoCity: 'Barishal',
    defaultZone: 'Barishal Sadar',
    subPostOffices: [
      { code: '8200', nameEn: 'Barishal GPO / Sadar', nameBn: 'বরিশাল জিপিও / সদর' },
      { code: '8230', nameEn: 'Gournadi', nameBn: 'গৌরনদী' },
    ],
  },
  34: {
    districtId: 34,
    defaultPostCode: '8300',
    pathaoCity: 'Bhola',
    defaultZone: 'Bhola Sadar',
    subPostOffices: [
      { code: '8300', nameEn: 'Bhola Sadar', nameBn: 'ভোলা সদর' },
      { code: '8350', nameEn: 'Charfesson', nameBn: 'চরফ্যাশন' },
    ],
  },
  35: {
    districtId: 35,
    defaultPostCode: '8700',
    pathaoCity: 'Barguna',
    defaultZone: 'Barguna Sadar',
    subPostOffices: [{ code: '8700', nameEn: 'Barguna Sadar', nameBn: 'বরগুনা সদর' }],
  },
  36: {
    districtId: 36,
    defaultPostCode: '3100',
    pathaoCity: 'Sylhet',
    defaultZone: 'Sylhet Sadar',
    subPostOffices: [
      { code: '3100', nameEn: 'Sylhet GPO / Zindabazar', nameBn: 'সিলেট জিপিও / জিন্দাবাজার' },
      { code: '3104', nameEn: 'Shah Paran', nameBn: 'শাহ পরাণ' },
      { code: '3107', nameEn: 'Jalalabad', nameBn: 'জালালাবাদ' },
    ],
  },
  37: {
    districtId: 37,
    defaultPostCode: '3200',
    pathaoCity: 'Moulvibazar',
    defaultZone: 'Moulvibazar Sadar',
    subPostOffices: [
      { code: '3200', nameEn: 'Moulvibazar Sadar', nameBn: 'মৌলভীবাজার সদর' },
      { code: '3210', nameEn: 'Sreemangal', nameBn: 'শ্রীমঙ্গল' },
    ],
  },
  38: {
    districtId: 38,
    defaultPostCode: '3300',
    pathaoCity: 'Habiganj',
    defaultZone: 'Habiganj Sadar',
    subPostOffices: [
      { code: '3300', nameEn: 'Habiganj Sadar', nameBn: 'হবিগঞ্জ সদর' },
      { code: '3301', nameEn: 'Shayestaganj', nameBn: 'শায়েস্তাগঞ্জ' },
    ],
  },
  39: {
    districtId: 39,
    defaultPostCode: '3000',
    pathaoCity: 'Sunamganj',
    defaultZone: 'Sunamganj Sadar',
    subPostOffices: [{ code: '3000', nameEn: 'Sunamganj Sadar', nameBn: 'সুনামগঞ্জ সদর' }],
  },
  40: {
    districtId: 40,
    defaultPostCode: '1600',
    pathaoCity: 'Narsingdi',
    defaultZone: 'Narsingdi Sadar',
    subPostOffices: [
      { code: '1600', nameEn: 'Narsingdi Sadar', nameBn: 'নরসিংদী সদর' },
      { code: '1610', nameEn: 'Palash / Ghorashal', nameBn: 'পলাশ / ঘোড়াশাল' },
      { code: '1604', nameEn: 'Madhabdi', nameBn: 'মাধবদী' },
    ],
  },
  41: {
    districtId: 41,
    defaultPostCode: '1700',
    pathaoCity: 'Gazipur',
    defaultZone: 'Gazipur Sadar',
    subPostOffices: [
      { code: '1700', nameEn: 'Gazipur Sadar / Joydebpur', nameBn: 'গাজীপুর সদর / জয়দেবপুর' },
      { code: '1710', nameEn: 'Tongi', nameBn: 'টঙ্গী' },
      { code: '1704', nameEn: 'National University / Board Bazar', nameBn: 'বোর্ড বাজার / গাছা' },
      { code: '1740', nameEn: 'Sreepur / Mawna', nameBn: 'শ্রীপুর / মাওনা' },
      { code: '1750', nameEn: 'Kaliakair', nameBn: 'কালিয়াকৈর' },
    ],
  },
  42: {
    districtId: 42,
    defaultPostCode: '8000',
    pathaoCity: 'Shariatpur',
    defaultZone: 'Shariatpur Sadar',
    subPostOffices: [{ code: '8000', nameEn: 'Shariatpur Sadar', nameBn: 'শরীয়তপুর সদর' }],
  },
  43: {
    districtId: 43,
    defaultPostCode: '1400',
    pathaoCity: 'Narayanganj',
    defaultZone: 'Narayanganj Sadar',
    subPostOffices: [
      { code: '1400', nameEn: 'Narayanganj Sadar / Chashara', nameBn: 'নারায়ণগঞ্জ সদর / চাষাড়া' },
      { code: '1420', nameEn: 'Fatullah', nameBn: 'ফতুল্লা' },
      { code: '1430', nameEn: 'Siddhirganj', nameBn: 'সিদ্ধিরগঞ্জ' },
      { code: '1460', nameEn: 'Rupganj', nameBn: 'রূপগঞ্জ' },
    ],
  },
  44: {
    districtId: 44,
    defaultPostCode: '1900',
    pathaoCity: 'Tangail',
    defaultZone: 'Tangail Sadar',
    subPostOffices: [
      { code: '1900', nameEn: 'Tangail Sadar', nameBn: 'টাঙ্গাইল সদর' },
      { code: '1940', nameEn: 'Mirzapur', nameBn: 'মির্জাপুর' },
      { code: '1996', nameEn: 'Madhupur', nameBn: 'মধুপুর' },
    ],
  },
  45: {
    districtId: 45,
    defaultPostCode: '2300',
    pathaoCity: 'Kishoreganj',
    defaultZone: 'Kishoreganj Sadar',
    subPostOffices: [
      { code: '2300', nameEn: 'Kishoreganj Sadar', nameBn: 'কিশোরগঞ্জ সদর' },
      { code: '2350', nameEn: 'Bhairab', nameBn: 'ভৈরব' },
    ],
  },
  46: {
    districtId: 46,
    defaultPostCode: '1800',
    pathaoCity: 'Manikganj',
    defaultZone: 'Manikganj Sadar',
    subPostOffices: [{ code: '1800', nameEn: 'Manikganj Sadar', nameBn: 'মানিকগঞ্জ সদর' }],
  },
  47: {
    districtId: 47,
    defaultPostCode: '1205',
    pathaoCity: 'Dhaka',
    defaultZone: 'Dhanmondi',
    subPostOffices: [
      { code: '1000', nameEn: 'Dhaka GPO / Motijheel', nameBn: 'ঢাকা জিপিও / মতিঝিল' },
      { code: '1100', nameEn: 'Dhaka Sadar / Old Dhaka', nameBn: 'পুরান ঢাকা / সদরঘাট' },
      { code: '1205', nameEn: 'Dhanmondi / New Market', nameBn: 'ধানমন্ডি / নিউ মার্কেট' },
      { code: '1207', nameEn: 'Mohammadpur', nameBn: 'মোহাম্মদপুর' },
      { code: '1212', nameEn: 'Gulshan / Badda', nameBn: 'গুলশান / বাড্ডা' },
      { code: '1213', nameEn: 'Banani', nameBn: 'বনানী' },
      { code: '1215', nameEn: 'Tejgaon / Farmgate', nameBn: 'তেজগাঁও / ফার্মগেট' },
      { code: '1216', nameEn: 'Mirpur / Pallabi', nameBn: 'মিরপুর / পল্লবী' },
      { code: '1219', nameEn: 'Khilgaon / Rampura', nameBn: 'খিলগাঁও / রামপুরা' },
      { code: '1229', nameEn: 'Khilkhet / Bashundhara R/A', nameBn: 'খিলক্ষেত / বসুন্ধরা আবাসিক' },
      { code: '1230', nameEn: 'Uttara', nameBn: 'উত্তরা' },
      { code: '1310', nameEn: 'Keraniganj', nameBn: 'কেরানীগঞ্জ' },
      { code: '1340', nameEn: 'Savar', nameBn: 'সাভার' },
    ],
  },
  48: {
    districtId: 48,
    defaultPostCode: '1500',
    pathaoCity: 'Munshiganj',
    defaultZone: 'Munshiganj Sadar',
    subPostOffices: [
      { code: '1500', nameEn: 'Munshiganj Sadar', nameBn: 'মুন্সিগঞ্জ সদর' },
      { code: '1550', nameEn: 'Sreenagar', nameBn: 'শ্রীনগর' },
    ],
  },
  49: {
    districtId: 49,
    defaultPostCode: '7700',
    pathaoCity: 'Rajbari',
    defaultZone: 'Rajbari Sadar',
    subPostOffices: [{ code: '7700', nameEn: 'Rajbari Sadar', nameBn: 'রাজবাড়ী সদর' }],
  },
  50: {
    districtId: 50,
    defaultPostCode: '7900',
    pathaoCity: 'Madaripur',
    defaultZone: 'Madaripur Sadar',
    subPostOffices: [
      { code: '7900', nameEn: 'Madaripur Sadar', nameBn: 'মাদারীপুর সদর' },
      { code: '7930', nameEn: 'Shibchar', nameBn: 'শিবচর' },
    ],
  },
  51: {
    districtId: 51,
    defaultPostCode: '8100',
    pathaoCity: 'Gopalganj',
    defaultZone: 'Gopalganj Sadar',
    subPostOffices: [{ code: '8100', nameEn: 'Gopalganj Sadar', nameBn: 'গোপালগঞ্জ সদর' }],
  },
  52: {
    districtId: 52,
    defaultPostCode: '7800',
    pathaoCity: 'Faridpur',
    defaultZone: 'Faridpur Sadar',
    subPostOffices: [
      { code: '7800', nameEn: 'Faridpur Sadar', nameBn: 'ফরিদপুর সদর' },
      { code: '7830', nameEn: 'Bhanga', nameBn: 'ভাঙ্গা' },
    ],
  },
  53: {
    districtId: 53,
    defaultPostCode: '5000',
    pathaoCity: 'Panchagarh',
    defaultZone: 'Panchagarh Sadar',
    subPostOffices: [
      { code: '5000', nameEn: 'Panchagarh Sadar', nameBn: 'পঞ্চগড় সদর' },
      { code: '5010', nameEn: 'Boda', nameBn: 'বোদা' },
      { code: '5020', nameEn: 'Debiganj', nameBn: 'দেবীগঞ্জ' },
      { code: '5030', nameEn: 'Tetulia', nameBn: 'তেঁতুলিয়া' },
      { code: '5040', nameEn: 'Atwari', nameBn: 'আটোয়ারী' },
    ],
  },
  54: {
    districtId: 54,
    defaultPostCode: '5200',
    pathaoCity: 'Dinajpur',
    defaultZone: 'Dinajpur Sadar',
    subPostOffices: [
      { code: '5200', nameEn: 'Dinajpur GPO / Sadar', nameBn: 'দিনাজপুর সদর' },
      { code: '5250', nameEn: 'Parbatipur', nameBn: 'পার্বতীপুর' },
      { code: '5260', nameEn: 'Fulbari', nameBn: 'ফুলবাড়ী' },
    ],
  },
  55: {
    districtId: 55,
    defaultPostCode: '5500',
    pathaoCity: 'Lalmonirhat',
    defaultZone: 'Lalmonirhat Sadar',
    subPostOffices: [
      { code: '5500', nameEn: 'Lalmonirhat Sadar', nameBn: 'লালমনিরহাট সদর' },
      { code: '5540', nameEn: 'Patgram', nameBn: 'পাটগ্রাম' },
    ],
  },
  56: {
    districtId: 56,
    defaultPostCode: '5300',
    pathaoCity: 'Nilphamari',
    defaultZone: 'Nilphamari Sadar',
    subPostOffices: [
      { code: '5300', nameEn: 'Nilphamari Sadar', nameBn: 'নীলফামারী সদর' },
      { code: '5310', nameEn: 'Saidpur', nameBn: 'সৈয়দপুর' },
    ],
  },
  57: {
    districtId: 57,
    defaultPostCode: '5700',
    pathaoCity: 'Gaibandha',
    defaultZone: 'Gaibandha Sadar',
    subPostOffices: [
      { code: '5700', nameEn: 'Gaibandha Sadar', nameBn: 'গাইবান্ধা সদর' },
      { code: '5740', nameEn: 'Gobindaganj', nameBn: 'গোবিন্দগঞ্জ' },
    ],
  },
  58: {
    districtId: 58,
    defaultPostCode: '5100',
    pathaoCity: 'Thakurgaon',
    defaultZone: 'Thakurgaon Sadar',
    subPostOffices: [
      { code: '5100', nameEn: 'Thakurgaon Sadar', nameBn: 'ঠাকুরগাঁও সদর' },
      { code: '5110', nameEn: 'Pirganj', nameBn: 'পীরগঞ্জ' },
    ],
  },
  59: {
    districtId: 59,
    defaultPostCode: '5400',
    pathaoCity: 'Rangpur',
    defaultZone: 'Rangpur Sadar',
    subPostOffices: [
      { code: '5400', nameEn: 'Rangpur GPO / Kotwali', nameBn: 'রংপুর জিপিও / কোতোয়ালী' },
      { code: '5404', nameEn: 'Tajhat', nameBn: 'তাজহাট' },
      { code: '5460', nameEn: 'Mithapukur', nameBn: 'মিঠাপুকুর' },
    ],
  },
  60: {
    districtId: 60,
    defaultPostCode: '5600',
    pathaoCity: 'Kurigram',
    defaultZone: 'Kurigram Sadar',
    subPostOffices: [{ code: '5600', nameEn: 'Kurigram Sadar', nameBn: 'কুড়িগ্রাম সদর' }],
  },
  61: {
    districtId: 61,
    defaultPostCode: '2100',
    pathaoCity: 'Sherpur',
    defaultZone: 'Sherpur Sadar',
    subPostOffices: [{ code: '2100', nameEn: 'Sherpur Sadar', nameBn: 'শেরপুর সদর' }],
  },
  62: {
    districtId: 62,
    defaultPostCode: '2200',
    pathaoCity: 'Mymensingh',
    defaultZone: 'Mymensingh Sadar',
    subPostOffices: [
      { code: '2200', nameEn: 'Mymensingh Sadar', nameBn: 'ময়মনসিংহ সদর' },
      { code: '2220', nameEn: 'Trishal', nameBn: 'ত্রিশাল' },
      { code: '2240', nameEn: 'Bhaluka', nameBn: 'ভালুকা' },
    ],
  },
  63: {
    districtId: 63,
    defaultPostCode: '2000',
    pathaoCity: 'Jamalpur',
    defaultZone: 'Jamalpur Sadar',
    subPostOffices: [{ code: '2000', nameEn: 'Jamalpur Sadar', nameBn: 'জামালপুর সদর' }],
  },
  64: {
    districtId: 64,
    defaultPostCode: '2400',
    pathaoCity: 'Netrokona',
    defaultZone: 'Netrokona Sadar',
    subPostOffices: [{ code: '2400', nameEn: 'Netrokona Sadar', nameBn: 'নেত্রকোণা সদর' }],
  },
};

/**
 * Exact 4-digit BD Post Codes & canonical Pathao Zone/Area mappings by Upazila/Thana ID.
 * Covers major metropolitan thanas, Dhaka/Chattogram/Gazipur/Narayanganj/Sylhet/Rajshahi/Khulna/
 * Barishal/Rangpur hubs, plus Panchagarh and key district headquarters. Remaining upazilas resolve
 * deterministically from their parent district head office code + upazila Pathao zone label.
 */
export const UPAZILA_COURIER_OVERRIDES: Record<
  number,
  { postCode: string; pathaoZone?: string; pathaoArea?: string }
> = {
  // Cumilla (1)
  1: { postCode: '3530', pathaoZone: 'Debidwar' },
  2: { postCode: '3560', pathaoZone: 'Barura' },
  3: { postCode: '3526', pathaoZone: 'Brahmanpara' },
  4: { postCode: '3510', pathaoZone: 'Chandina' },
  5: { postCode: '3550', pathaoZone: 'Chauddagram' },
  6: { postCode: '3516', pathaoZone: 'Daudkandi' },
  7: { postCode: '3546', pathaoZone: 'Homna' },
  8: { postCode: '3570', pathaoZone: 'Laksam' },
  9: { postCode: '3540', pathaoZone: 'Muradnagar' },
  10: { postCode: '3580', pathaoZone: 'Nangalkot' },
  11: { postCode: '3500', pathaoZone: 'Cumilla Sadar', pathaoArea: 'Kandirpar' },
  12: { postCode: '3515', pathaoZone: 'Meghna' },
  13: { postCode: '3572', pathaoZone: 'Monohargonj' },
  14: { postCode: '3501', pathaoZone: 'Cumilla Sadar South' },
  15: { postCode: '3548', pathaoZone: 'Titas' },
  16: { postCode: '3520', pathaoZone: 'Burichang' },
  17: { postCode: '3502', pathaoZone: 'Lalmai' },
  // Feni (2)
  18: { postCode: '3910', pathaoZone: 'Chhagalnaiya' },
  19: { postCode: '3900', pathaoZone: 'Feni Sadar', pathaoArea: 'Trunk Road' },
  20: { postCode: '3930', pathaoZone: 'Sonagazi' },
  21: { postCode: '3942', pathaoZone: 'Fulgazi' },
  22: { postCode: '3940', pathaoZone: 'Parshuram' },
  23: { postCode: '3920', pathaoZone: 'Daganbhuiyan' },
  // Chattogram Metro & Upazilas (8)
  65: { postCode: '4360', pathaoZone: 'Rangunia' },
  66: { postCode: '4310', pathaoZone: 'Sitakunda' },
  67: { postCode: '4320', pathaoZone: 'Mirsharai' },
  68: { postCode: '4370', pathaoZone: 'Patiya' },
  69: { postCode: '4300', pathaoZone: 'Sandwip' },
  70: { postCode: '4390', pathaoZone: 'Banshkhali' },
  71: { postCode: '4366', pathaoZone: 'Boalkhali' },
  72: { postCode: '4376', pathaoZone: 'Anwara' },
  73: { postCode: '4380', pathaoZone: 'Chandanaish' },
  74: { postCode: '4386', pathaoZone: 'Satkania' },
  75: { postCode: '4396', pathaoZone: 'Lohagara' },
  76: { postCode: '4330', pathaoZone: 'Hathazari' },
  77: { postCode: '4350', pathaoZone: 'Fatikchhari' },
  78: { postCode: '4340', pathaoZone: 'Raozan' },
  79: { postCode: '4377', pathaoZone: 'Karnafuli' },
  5000: { postCode: '4207', pathaoZone: 'Akbar Shah', pathaoArea: 'City Gate' },
  5001: { postCode: '4203', pathaoZone: 'Bakalia', pathaoArea: 'Bakalia' },
  5002: { postCode: '4100', pathaoZone: 'Bandar', pathaoArea: 'Chattogram Port' },
  5003: { postCode: '4210', pathaoZone: 'Bayazid', pathaoArea: 'Bayazid Bostami' },
  5004: { postCode: '4212', pathaoZone: 'Chandgaon', pathaoArea: 'Bahaddarhat' },
  5005: { postCode: '4203', pathaoZone: 'Chawkbazar', pathaoArea: 'Chawkbazar' },
  5006: { postCode: '4100', pathaoZone: 'Agrabad', pathaoArea: 'Double Mooring' },
  5007: { postCode: '4223', pathaoZone: 'EPZ', pathaoArea: 'CEPZ' },
  5008: { postCode: '4216', pathaoZone: 'Halishahar', pathaoArea: 'Halishahar' },
  5009: { postCode: '4225', pathaoZone: 'Khulshi', pathaoArea: 'GEC Circle' },
  5010: { postCode: '4000', pathaoZone: 'Kotwali', pathaoArea: 'Anderkilla' },
  5011: { postCode: '4202', pathaoZone: 'Pahartali', pathaoArea: 'Pahartali' },
  5012: { postCode: '4203', pathaoZone: 'Panchlaish', pathaoArea: 'Muradpur' },
  5013: { postCode: '4204', pathaoZone: 'Patenga', pathaoArea: 'Patenga' },
  5014: { postCode: '4000', pathaoZone: 'Sadarghat', pathaoArea: 'Sadarghat' },
  // Rajshahi Metro (15)
  5015: { postCode: '6210', pathaoZone: 'Airport', pathaoArea: 'Airport' },
  5016: { postCode: '6206', pathaoZone: 'Belpukur' },
  5017: { postCode: '6100', pathaoZone: 'Boalia', pathaoArea: 'Shaheb Bazar' },
  5018: { postCode: '6207', pathaoZone: 'Chandrima' },
  5019: { postCode: '6212', pathaoZone: 'Damkura' },
  5020: { postCode: '6211', pathaoZone: 'Karnahar' },
  5021: { postCode: '6202', pathaoZone: 'Kashiadanga' },
  5022: { postCode: '6212', pathaoZone: 'Katakhali' },
  5023: { postCode: '6205', pathaoZone: 'Motihar', pathaoArea: 'Talaimari' },
  5024: { postCode: '6000', pathaoZone: 'Rajpara', pathaoArea: 'Laxmipur' },
  5025: { postCode: '6203', pathaoZone: 'Shah Makhdum' },
  // Khulna Metro (27)
  5026: { postCode: '9203', pathaoZone: 'Aranghata' },
  5027: { postCode: '9202', pathaoZone: 'Daulatpur', pathaoArea: 'Daulatpur' },
  5028: { postCode: '9208', pathaoZone: 'Harintana' },
  5029: { postCode: '9000', pathaoZone: 'Khalishpur', pathaoArea: 'Khalishpur' },
  5030: { postCode: '9204', pathaoZone: 'Khan Jahan Ali' },
  5031: { postCode: '9100', pathaoZone: 'Khulna Sadar', pathaoArea: 'Shib Bari' },
  5032: { postCode: '9100', pathaoZone: 'Labanchara' },
  5033: { postCode: '9100', pathaoZone: 'Sonadanga', pathaoArea: 'Sonadanga' },
  // Barishal Metro (33)
  5034: { postCode: '8211', pathaoZone: 'Airport' },
  5035: { postCode: '8200', pathaoZone: 'Bandar' },
  5036: { postCode: '8200', pathaoZone: 'Kawnia' },
  // Sylhet Metro (36)
  5037: { postCode: '3100', pathaoZone: 'Airport', pathaoArea: 'Amberkhana' },
  5038: { postCode: '3107', pathaoZone: 'Jalalabad' },
  5039: { postCode: '3100', pathaoZone: 'Kotwali', pathaoArea: 'Zindabazar' },
  5040: { postCode: '3108', pathaoZone: 'Moglabazar' },
  5041: { postCode: '3104', pathaoZone: 'Shah Paran' },
  5042: { postCode: '3301', pathaoZone: 'Shayestaganj' },
  // Gazipur (41)
  317: { postCode: '1720', pathaoZone: 'Kaliganj' },
  318: { postCode: '1750', pathaoZone: 'Kaliakair' },
  319: { postCode: '1730', pathaoZone: 'Kapasia' },
  320: { postCode: '1700', pathaoZone: 'Gazipur Sadar', pathaoArea: 'Joydebpur' },
  321: { postCode: '1740', pathaoZone: 'Sreepur', pathaoArea: 'Mawna' },
  5043: { postCode: '1702', pathaoZone: 'Bason', pathaoArea: 'Chandona Chowrasta' },
  5044: { postCode: '1704', pathaoZone: 'Gacha', pathaoArea: 'Board Bazar' },
  5045: { postCode: '1700', pathaoZone: 'Kashimpur', pathaoArea: 'Kashimpur' },
  5046: { postCode: '1700', pathaoZone: 'Konabari', pathaoArea: 'Konabari' },
  5047: { postCode: '1721', pathaoZone: 'Pubail' },
  5048: { postCode: '1710', pathaoZone: 'Tongi', pathaoArea: 'Tongi Station Road' },
  5049: { postCode: '1712', pathaoZone: 'Tongi', pathaoArea: 'College Gate' },
  // Narayanganj (43)
  328: { postCode: '1450', pathaoZone: 'Araihazar' },
  329: { postCode: '1410', pathaoZone: 'Bandar' },
  330: { postCode: '1400', pathaoZone: 'Narayanganj Sadar', pathaoArea: 'Chashara' },
  331: { postCode: '1460', pathaoZone: 'Rupganj', pathaoArea: 'Bhulta' },
  332: { postCode: '1440', pathaoZone: 'Sonargaon', pathaoArea: 'Mograpara' },
  5050: { postCode: '1420', pathaoZone: 'Fatullah', pathaoArea: 'Fatullah' },
  5051: { postCode: '1430', pathaoZone: 'Siddhirganj', pathaoArea: 'Signboard' },
  // Dhaka District & Metro Thanas (47)
  365: { postCode: '1340', pathaoZone: 'Savar', pathaoArea: 'Savar Bazar' },
  366: { postCode: '1350', pathaoZone: 'Dhamrai', pathaoArea: 'Dhamrai' },
  367: { postCode: '1310', pathaoZone: 'Keraniganj', pathaoArea: 'Keraniganj' },
  368: { postCode: '1320', pathaoZone: 'Nawabganj' },
  369: { postCode: '1330', pathaoZone: 'Dohar' },
  5052: { postCode: '1207', pathaoZone: 'Adabor', pathaoArea: 'Adabor' },
  5053: { postCode: '1229', pathaoZone: 'Airport', pathaoArea: 'Airport' },
  5054: { postCode: '1212', pathaoZone: 'Badda', pathaoArea: 'Middle Badda' },
  5055: { postCode: '1213', pathaoZone: 'Banani', pathaoArea: 'Banani' },
  5056: { postCode: '1100', pathaoZone: 'Bangshal', pathaoArea: 'Bangshal' },
  5057: { postCode: '1206', pathaoZone: 'Bhashantek', pathaoArea: 'Bhashantek' },
  5058: { postCode: '1229', pathaoZone: 'Bhatara', pathaoArea: 'Bashundhara R/A' },
  5059: { postCode: '1206', pathaoZone: 'Cantonment', pathaoArea: 'Dhaka Cantonment' },
  5060: { postCode: '1211', pathaoZone: 'Chawkbazar', pathaoArea: 'Chawkbazar' },
  5061: { postCode: '1230', pathaoZone: 'Dakshinkhan', pathaoArea: 'Dakshinkhan' },
  5062: { postCode: '1216', pathaoZone: 'Darus Salam', pathaoArea: 'Technical' },
  5063: { postCode: '1360', pathaoZone: 'Demra', pathaoArea: 'Demra' },
  5064: { postCode: '1205', pathaoZone: 'Dhanmondi', pathaoArea: 'Dhanmondi' },
  5065: { postCode: '1204', pathaoZone: 'Gandaria', pathaoArea: 'Gandaria' },
  5066: { postCode: '1212', pathaoZone: 'Gulshan', pathaoArea: 'Gulshan 1' },
  5067: { postCode: '1217', pathaoZone: 'Hatirjheel', pathaoArea: 'Moghbazar' },
  5068: { postCode: '1209', pathaoZone: 'Hazaribagh', pathaoArea: 'Hazaribagh' },
  5069: { postCode: '1204', pathaoZone: 'Jatrabari', pathaoArea: 'Jatrabari' },
  5070: { postCode: '1362', pathaoZone: 'Kadamtali', pathaoArea: 'Kadamtali' },
  5071: { postCode: '1206', pathaoZone: 'Kafrul', pathaoArea: 'Mirpur 14' },
  5072: { postCode: '1205', pathaoZone: 'Kalabagan', pathaoArea: 'Kalabagan' },
  5073: { postCode: '1211', pathaoZone: 'Kamrangirchar', pathaoArea: 'Kamrangirchar' },
  5074: { postCode: '1219', pathaoZone: 'Khilgaon', pathaoArea: 'Khilgaon' },
  5075: { postCode: '1229', pathaoZone: 'Khilkhet', pathaoArea: 'Khilkhet' },
  5076: { postCode: '1100', pathaoZone: 'Kotwali', pathaoArea: 'Sadarghat' },
  5077: { postCode: '1211', pathaoZone: 'Lalbagh', pathaoArea: 'Lalbagh' },
  5078: { postCode: '1216', pathaoZone: 'Mirpur', pathaoArea: 'Mirpur 10' },
  5079: { postCode: '1207', pathaoZone: 'Mohammadpur', pathaoArea: 'Mohammadpur' },
  5080: { postCode: '1000', pathaoZone: 'Motijheel', pathaoArea: 'Motijheel' },
  5081: { postCode: '1214', pathaoZone: 'Mugda', pathaoArea: 'Mugda' },
  5082: { postCode: '1205', pathaoZone: 'New Market', pathaoArea: 'New Market' },
  5083: { postCode: '1216', pathaoZone: 'Pallabi', pathaoArea: 'Mirpur 12' },
  5084: { postCode: '1000', pathaoZone: 'Paltan', pathaoArea: 'Purana Paltan' },
  5085: { postCode: '1000', pathaoZone: 'Ramna', pathaoArea: 'Ramna' },
  5086: { postCode: '1219', pathaoZone: 'Rampura', pathaoArea: 'Rampura' },
  5087: { postCode: '1216', pathaoZone: 'Rupnagar', pathaoArea: 'Rupnagar' },
  5088: { postCode: '1214', pathaoZone: 'Sabujbagh', pathaoArea: 'Basabo' },
  5089: { postCode: '1216', pathaoZone: 'Shah Ali', pathaoArea: 'Mirpur 1' },
  5090: { postCode: '1000', pathaoZone: 'Shahbagh', pathaoArea: 'Shahbagh' },
  5091: { postCode: '1217', pathaoZone: 'Shahjahanpur', pathaoArea: 'Shahjahanpur' },
  5092: { postCode: '1207', pathaoZone: 'Sher-e-Bangla Nagar', pathaoArea: 'Agargaon' },
  5093: { postCode: '1204', pathaoZone: 'Shyampur', pathaoArea: 'Shyampur' },
  5094: { postCode: '1100', pathaoZone: 'Sutrapur', pathaoArea: 'Sutrapur' },
  5095: { postCode: '1215', pathaoZone: 'Tejgaon', pathaoArea: 'Farmgate' },
  5096: { postCode: '1208', pathaoZone: 'Tejgaon Industrial', pathaoArea: 'Tejgaon I/A' },
  5097: { postCode: '1230', pathaoZone: 'Turag', pathaoArea: 'Diabari' },
  5098: { postCode: '1230', pathaoZone: 'Uttar Khan', pathaoArea: 'Uttar Khan' },
  5099: { postCode: '1230', pathaoZone: 'Uttara', pathaoArea: 'Uttara Sector 4' },
  5100: { postCode: '1230', pathaoZone: 'Uttara', pathaoArea: 'Uttara Sector 11' },
  5101: { postCode: '1203', pathaoZone: 'Wari', pathaoArea: 'Wari' },
  // Panchagarh (53)
  399: { postCode: '5000', pathaoZone: 'Panchagarh Sadar', pathaoArea: 'Panchagarh Town' },
  400: { postCode: '5020', pathaoZone: 'Debiganj', pathaoArea: 'Debiganj Bazar' },
  401: { postCode: '5010', pathaoZone: 'Boda', pathaoArea: 'Boda Bazar' },
  402: { postCode: '5040', pathaoZone: 'Atwari', pathaoArea: 'Atwari' },
  403: { postCode: '5030', pathaoZone: 'Tetulia', pathaoArea: 'Tetulia Bazar' },
  // Rangpur Metro (59)
  5102: { postCode: '5441', pathaoZone: 'Haragach' },
  5103: { postCode: '5402', pathaoZone: 'Hazirhat' },
  5104: { postCode: '5400', pathaoZone: 'Rangpur Sadar', pathaoArea: 'Jahaj Company' },
  5105: { postCode: '5403', pathaoZone: 'Mahiganj' },
  5106: { postCode: '5401', pathaoZone: 'Parshuram' },
  5107: { postCode: '5404', pathaoZone: 'Tajhat', pathaoArea: 'Modern More' },
};

const STREET_KEYWORD_HINTS: Array<{
  districtId: number;
  pattern: RegExp;
  postCode: string;
  recipientZone: string;
  recipientArea: string;
}> = [
  { districtId: 47, pattern: /\buttara\b|উত্তরা|sector[-\s]*(?:1|2|3|4|5|6|7|8|9|10|11|12|13|14)\b/i, postCode: '1230', recipientZone: 'Uttara', recipientArea: 'Uttara Sector 6' },
  { districtId: 47, pattern: /\bmirpur\b|মিরপুর/i, postCode: '1216', recipientZone: 'Mirpur', recipientArea: 'Mirpur 10' },
  { districtId: 47, pattern: /\bdhanmondi\b|ধানমন্ডি/i, postCode: '1205', recipientZone: 'Dhanmondi', recipientArea: 'Dhanmondi' },
  { districtId: 47, pattern: /\bgulshan\b|গুলশান/i, postCode: '1212', recipientZone: 'Gulshan', recipientArea: 'Gulshan 1' },
  { districtId: 47, pattern: /\bbanani\b|বনানী/i, postCode: '1213', recipientZone: 'Banani', recipientArea: 'Banani' },
  { districtId: 47, pattern: /\bbashundhara\b|বসুন্ধরা/i, postCode: '1229', recipientZone: 'Bhatara', recipientArea: 'Bashundhara R/A' },
  { districtId: 47, pattern: /\bmohammadpur\b|মোহাম্মদপুর/i, postCode: '1207', recipientZone: 'Mohammadpur', recipientArea: 'Mohammadpur' },
  { districtId: 47, pattern: /\bmotijheel\b|মতিঝিল/i, postCode: '1000', recipientZone: 'Motijheel', recipientArea: 'Motijheel' },
  { districtId: 47, pattern: /\bbadda\b|বাড্ডা/i, postCode: '1212', recipientZone: 'Badda', recipientArea: 'Middle Badda' },
  { districtId: 47, pattern: /\brampura\b|রামপুরা|banasree|বনশ্রী/i, postCode: '1219', recipientZone: 'Rampura', recipientArea: 'Banasree' },
  { districtId: 47, pattern: /\bsavar\b|সাভার|ashulia|আশুলিয়া/i, postCode: '1340', recipientZone: 'Savar', recipientArea: 'Savar Bazar' },
  { districtId: 47, pattern: /\bfarmgate\b|ফার্মগেট|tejgaon|তেজগাঁও/i, postCode: '1215', recipientZone: 'Tejgaon', recipientArea: 'Farmgate' },
  { districtId: 8, pattern: /\bagrabad\b|আগ্রাবাদ/i, postCode: '4100', recipientZone: 'Agrabad', recipientArea: 'Agrabad' },
  { districtId: 41, pattern: /\btongi\b|টঙ্গী/i, postCode: '1710', recipientZone: 'Tongi', recipientArea: 'Tongi Station Road' },
];

export function isValidBdPostCode(raw: string | undefined | null): boolean {
  return /^\d{4}$/.test((raw ?? '').trim());
}

export function getDistrictPostOffices(
  districtId: number
): Array<{ code: string; nameEn: string; nameBn: string }> {
  return DISTRICT_COURIER_META[districtId]?.subPostOffices ?? [];
}

/**
 * Computes a deterministic 4-digit BD Post Code for any of the 607 upazilas/thanas.
 * Exact overrides take priority; otherwise maps cleanly from the parent district base code.
 */
export function resolveDefaultPostCode(districtId: number, upazilaId?: number | null): string {
  if (upazilaId && UPAZILA_COURIER_OVERRIDES[upazilaId]?.postCode) {
    return UPAZILA_COURIER_OVERRIDES[upazilaId].postCode;
  }
  const districtMeta = DISTRICT_COURIER_META[districtId];
  return districtMeta?.defaultPostCode ?? '1000';
}

/**
 * Resolves 4-digit Post Code + canonical Pathao City / Zone / Area from District, Upazila/Thana,
 * and optional street address/landmark keywords.
 */
export function resolveGeoCourierDefaults(input: {
  districtId: number;
  upazilaId?: number | null;
  streetAddress?: string;
  landmark?: string;
  existingPostCode?: string;
  existingCity?: string;
  existingZone?: string;
  existingArea?: string;
}): ResolvedCourierGeoDefaults {
  const district = getDistrictById(input.districtId);
  const upazila = input.upazilaId ? getUpazilaById(input.upazilaId) : undefined;
  const districtMeta = DISTRICT_COURIER_META[input.districtId];
  const pathaoCity =
    input.existingCity?.trim() ||
    districtMeta?.pathaoCity ||
    district?.name_en ||
    'Dhaka';

  const override = upazila ? UPAZILA_COURIER_OVERRIDES[upazila.id] : undefined;
  let postCode =
    isValidBdPostCode(input.existingPostCode)
      ? input.existingPostCode!.trim()
      : override?.postCode ?? districtMeta?.defaultPostCode ?? '1000';

  let recipientZone =
    input.existingZone?.trim() ||
    override?.pathaoZone ||
    upazila?.name_en ||
    districtMeta?.defaultZone ||
    (district ? `${district.name_en} Sadar` : 'Dhaka');

  let recipientArea =
    input.existingArea?.trim() ||
    override?.pathaoArea ||
    upazila?.name_en ||
    districtMeta?.defaultZone ||
    '';

  let confidence: ResolvedCourierGeoDefaults['confidence'] = override
    ? 'exact_thana'
    : upazila
      ? 'exact_thana'
      : 'district_fallback';

  const combinedText = `${input.streetAddress ?? ''} ${input.landmark ?? ''}`.trim();
  if (combinedText.length > 0) {
    const streetHint = STREET_KEYWORD_HINTS.find(
      (hint) => hint.districtId === input.districtId && hint.pattern.test(combinedText)
    );
    if (streetHint) {
      if (!input.existingZone?.trim()) {
        recipientZone = streetHint.recipientZone;
      }
      if (!input.existingArea?.trim()) {
        recipientArea = streetHint.recipientArea;
      }
      if (!isValidBdPostCode(input.existingPostCode)) {
        postCode = streetHint.postCode;
      }
      confidence = 'street_inferred';
    }
  }

  return {
    postCode,
    recipientCity: pathaoCity,
    recipientZone,
    recipientArea,
    confidence,
  };
}

export function getPathaoCities(): string[] {
  const cities = new Set<string>();
  for (const d of BD_DISTRICTS) {
    cities.add(DISTRICT_COURIER_META[d.id]?.pathaoCity ?? d.name_en);
  }
  return Array.from(cities).sort((a, b) => a.localeCompare(b));
}

export function getPathaoZonesByCity(city: string): string[] {
  const normalizedCity = city.trim().toLowerCase();
  const matchedDistricts = BD_DISTRICTS.filter((d) => {
    const mapped = DISTRICT_COURIER_META[d.id]?.pathaoCity ?? d.name_en;
    return mapped.toLowerCase() === normalizedCity || d.name_en.toLowerCase() === normalizedCity;
  });

  const zones = new Set<string>();
  for (const dist of matchedDistricts) {
    const meta = DISTRICT_COURIER_META[dist.id];
    if (meta?.defaultZone) zones.add(meta.defaultZone);
    for (const u of BD_UPAZILAS) {
      if (u.district_id !== dist.id) continue;
      const ov = UPAZILA_COURIER_OVERRIDES[u.id];
      zones.add(ov?.pathaoZone ?? u.name_en);
    }
  }
  return Array.from(zones);
}

export function getPathaoAreasByZone(city: string, zone: string = ''): string[] {
  const normalizedCity = city.trim().toLowerCase();
  const normalizedZone = zone.trim().toLowerCase();
  const areas = new Set<string>();

  for (const u of BD_UPAZILAS) {
    const meta = DISTRICT_COURIER_META[u.district_id];
    const cityName = (meta?.pathaoCity ?? '').toLowerCase();
    if (normalizedCity && cityName !== normalizedCity) continue;
    const ov = UPAZILA_COURIER_OVERRIDES[u.id];
    const uZone = (ov?.pathaoZone ?? u.name_en).toLowerCase();
    if (!normalizedZone || uZone === normalizedZone || u.name_en.toLowerCase() === normalizedZone) {
      if (ov?.pathaoArea) areas.add(ov.pathaoArea);
      areas.add(u.name_en);
    }
  }

  for (const hint of STREET_KEYWORD_HINTS) {
    const cityName = (DISTRICT_COURIER_META[hint.districtId]?.pathaoCity ?? '').toLowerCase();
    if (
      (!normalizedCity || cityName === normalizedCity) &&
      (!normalizedZone || hint.recipientZone.toLowerCase() === normalizedZone)
    ) {
      areas.add(hint.recipientArea);
    }
  }

  if (areas.size === 0 && zone.trim().length > 0) {
    areas.add(zone.trim());
  }
  return Array.from(areas);
}

export function resolveCourierGeoForAddress(input: {
  districtId: number;
  districtNameEn?: string;
  upazilaId?: number | null;
  upazilaNameEn?: string;
  streetAddress?: string;
  landmark?: string;
  existingPostCode?: string;
  existingCity?: string;
  existingZone?: string;
  existingArea?: string;
}): ResolvedCourierGeoDefaults {
  return resolveGeoCourierDefaults(input);
}

export function getPathaoZonesForDistrict(districtId: number): string[] {
  const dist = getDistrictById(districtId);
  const city = DISTRICT_COURIER_META[districtId]?.pathaoCity ?? dist?.name_en ?? 'Dhaka';
  return getPathaoZonesByCity(city);
}
