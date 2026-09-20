const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const csv = require('csv-parser');

const DATA_DIRECTORY = path.join(__dirname, '..', 'data');
const CACHE_DIRECTORY = path.join(DATA_DIRECTORY, '.wec-cache');
const TIMING_ORIGIN = 'https://fiawec.alkamelsystems.com';
const refresh = process.argv.includes('--refresh');
const discover = process.argv.includes('--discover');

const EVENTS_2022 = [
  ['wec-2022-r1-sebring', '01_SEBRING', '2022-r01-sebring', -4, 36, '2022-03-18T16:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/11_2022/01_SEBRING/402_FIA%20WEC/202203181200_Race/Final%20Results/03_Classification_Race_Hour%208.CSV'],
  ['wec-2022-r2-spa', '02_SPA%20FRANCORCHAMPS', '2022-r02-spa-francorchamps', 2, 37, '2022-05-07T11:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/11_2022/02_SPA%20FRANCORCHAMPS/408_FIA%20WEC/202205071300_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2022-r3-le-mans', '03_LE%20MANS', '2022-r03-le-mans', 2, 62, '2022-06-11T14:00:00Z', 'le-mans', 'https://fiawec.alkamelsystems.com/Results/11_2022/03_LE%20MANS/419_FIA%20WEC/202206111600_Race/24_Hour%2024/03_Classification_Race_Hour%2024.CSV'],
  ['wec-2022-r4-monza', '04_AUTODROMO%20NAZIONALE%20DI%20MONZA', '2022-r04-autodromo-nazionale-di-monza', 2, 38, '2022-07-10T10:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/11_2022/04_AUTODROMO%20NAZIONALE%20DI%20MONZA/432_FIA%20WEC/202207101200_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2022-r5-fuji', '05_FUJI%20SPEEDWAY', '2022-r05-fuji-speedway', 9, 36, '2022-09-11T02:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/11_2022/05_FUJI%20SPEEDWAY/440_FIA%20WEC/202209111100_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2022-r6-bahrain', '06_BAHRAIN%20INTERNATIONAL%20CIRCUIT', '2022-r06-bahrain-international-circuit', 3, 37, '2022-11-12T11:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/11_2022/06_BAHRAIN%20INTERNATIONAL%20CIRCUIT/455_FIA%20WEC/202211121400_Race/Hour%208/03_Classification_Race_Hour%208.CSV'],
].map(([id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl]) => ({ id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl }));

const FINAL_2022 = 'https://fiawec.alkamelsystems.com/Results/11_2022/06_BAHRAIN%20INTERNATIONAL%20CIRCUIT/455_FIA%20WEC/Final%20Championships';
const CHAMPIONSHIPS_2022 = [
  { id: 'wec-2022-hypercar-manufacturers', name: 'FIA Hypercar World Endurance Manufacturers’ Championship', entityType: 'manufacturer', classId: 'wec-2022-hypercar', pdfUrl: `${FINAL_2022}/2022_Hypercar_World_Endurance_Manufacturers_Championship_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-hypercar-drivers', name: 'FIA Hypercar World Endurance Drivers’ Championship', entityType: 'driver', classId: 'wec-2022-hypercar', pdfUrl: `${FINAL_2022}/2022_Hypercar_World_Endurance_Drivers_Championship_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-lmgte-manufacturers', name: 'FIA LMGTE World Endurance Manufacturers’ Championship', entityType: 'manufacturer', classId: 'wec-2022-lmgte-pro', pdfUrl: `${FINAL_2022}/2022_LMGTE_World_Endurance_Manufacturers_Championship_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-lmgte-drivers', name: 'FIA LMGTE World Endurance Drivers’ Championship', entityType: 'driver', classId: 'wec-2022-lmgte-pro', pdfUrl: `${FINAL_2022}/2022_World_Endurance_Drivers_Championship_LMGTE_Drivers_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-lmp2-teams', name: 'FIA Endurance Trophy for LMP2 Teams', entityType: 'competitor', classId: 'wec-2022-lmp2', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMP2_Teams_After_BAHRAIN.pdf`, pdfLayout: 'team' },
  { id: 'wec-2022-lmp2-drivers', name: 'FIA Endurance Trophy for LMP2 Drivers', entityType: 'driver', classId: 'wec-2022-lmp2', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMP2_Drivers_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-lmp2-pro-am-teams', name: 'FIA Endurance Trophy for LMP2 Pro/Am Teams', entityType: 'competitor', classId: 'wec-2022-lmp2', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMP2_ProAm_Teams_After_BAHRAIN.pdf`, pdfLayout: 'team' },
  { id: 'wec-2022-lmp2-pro-am-drivers', name: 'FIA Endurance Trophy for LMP2 Pro/Am Drivers', entityType: 'driver', classId: 'wec-2022-lmp2', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMP2_ProAm_Drivers_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2022-lmgte-am-teams', name: 'FIA Endurance Trophy for LMGTE Am Teams', entityType: 'competitor', classId: 'wec-2022-lmgte-am', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMGTE_Am_Teams_After_BAHRAIN.pdf`, pdfLayout: 'team' },
  { id: 'wec-2022-lmgte-am-drivers', name: 'FIA Endurance Trophy for LMGTE Am Drivers', entityType: 'driver', classId: 'wec-2022-lmgte-am', pdfUrl: `${FINAL_2022}/2022_FIA_Endurance_Trophy_LMGTE_Am_Drivers_After_BAHRAIN.pdf`, pdfLayout: 'individual' },
];

const EVENTS_2025 = [
  ['wec-2025-r1-qatar', '01_LOSAIL', '2025-r01-losail', 3, 36, '2025-02-28T11:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/14_2025/01_LOSAIL/579_FIA%20WEC/202502281400_Race/10_Hour%2010/03_Classification_Race_Hour%2010.CSV'],
  ['wec-2025-r2-imola', '02_IMOLA', '2025-r02-imola', 2, 36, '2025-04-20T11:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/14_2025/02_IMOLA/589_FIA%20WEC/202504201300_Race/06_Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2025-r3-spa', '03_SPA%20FRANCORCHAMPS', '2025-r03-spa-francorchamps', 2, 36, '2025-05-10T12:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/14_2025/03_SPA%20FRANCORCHAMPS/597_FIA%20WEC/202505101400_Race/06_Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2025-r4-le-mans', '04_LE%20MANS', '2025-r04-le-mans', 2, 62, '2025-06-14T14:00:00Z', 'le-mans', 'https://fiawec.alkamelsystems.com/Results/14_2025/04_LE%20MANS/600_FIA%20WEC/202506141600_Race/24_Hour%2024/03_Classification_Race_Hour%2024.CSV'],
  ['wec-2025-r5-sao-paulo', '05_SAO%20PAULO', '2025-r05-sao-paulo', -3, 36, '2025-07-13T14:30:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/14_2025/05_SAO%20PAULO/613_FIA%20WEC/202507131130_Race/06_Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2025-r6-cota', '06_CIRCUIT%20OF%20THE%20AMERICAS', '2025-r06-circuit-of-the-americas', -5, 36, '2025-09-07T18:30:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/14_2025/06_CIRCUIT%20OF%20THE%20AMERICAS/620_FIA%20WEC/202509071330_Race/06_Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2025-r7-fuji', '07_FUJI%20SPEEDWAY', '2025-r07-fuji-speedway', 9, 36, '2025-09-28T02:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/14_2025/07_FUJI%20SPEEDWAY/626_FIA%20WEC/202509281100_Race/06_Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2025-r8-bahrain', '08_BAHRAIN%20INTERNATIONAL%20CIRCUIT', '2025-r08-bahrain-international-circuit', 3, 36, '2025-11-08T11:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/14_2025/08_BAHRAIN%20INTERNATIONAL%20CIRCUIT/635_FIA%20WEC/202511081400_Race/08_Hour%208/03_Classification_Race_Hour%208.CSV'],
].map(([id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl]) => ({ id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl }));

const CHAMPIONSHIPS_2025 = [
  { tableId: 65, id: 'wec-2025-hypercar-manufacturers', name: 'FIA Hypercar World Endurance Manufacturers’ Championship', entityType: 'manufacturer', classId: 'wec-2025-hypercar' },
  { tableId: 66, id: 'wec-2025-hypercar-teams', name: 'FIA World Cup for Hypercar Teams', entityType: 'competitor', classId: 'wec-2025-hypercar' },
  { tableId: 55, id: 'wec-2025-hypercar-drivers', name: 'FIA Hypercar World Endurance Drivers’ Championship', entityType: 'driver', classId: 'wec-2025-hypercar' },
  { tableId: 73, id: 'wec-2025-lmgt3-teams', name: 'FIA Endurance Trophy for LMGT3 Teams', entityType: 'competitor', classId: 'wec-2025-lmgt3' },
  { tableId: 72, id: 'wec-2025-lmgt3-drivers', name: 'FIA Endurance Trophy for LMGT3 Drivers', entityType: 'driver', classId: 'wec-2025-lmgt3' },
];

const EVENTS_2024 = [
  ['wec-2024-r1-qatar', '01_LOSAIL', '2024-r01-losail', 3, 37, '2024-03-02T08:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/13_2024/01_LOSAIL/517_FIA%20WEC/202403021100_Race/10_Hour%2010/03_Classification_Race_Hour%2010.CSV'],
  ['wec-2024-r2-imola', '02_IMOLA', '2024-r02-imola', 2, 37, '2024-04-21T11:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/13_2024/02_IMOLA/526_FIA%20WEC/202404211300_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2024-r3-spa', '03_SPA%20FRANCORCHAMPS', '2024-r03-spa-francorchamps', 2, 37, '2024-05-11T11:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/13_2024/03_SPA%20FRANCORCHAMPS/536_FIA%20WEC/202405111300_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2024-r4-le-mans', '04_LE%20MANS', '2024-r04-le-mans', 2, 62, '2024-06-15T14:00:00Z', 'le-mans', 'https://fiawec.alkamelsystems.com/Results/13_2024/04_LE%20MANS/541_FIA%20WEC/202406151600_Race/24_Hour%2024/03_Classification_Race_Hour%2024.CSV'],
  ['wec-2024-r5-sao-paulo', '05_SAO%20PAULO', '2024-r05-sao-paulo', -3, 36, '2024-07-14T14:30:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/13_2024/05_SAO%20PAULO/552_FIA%20WEC/202407141130_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2024-r6-cota', '06_CIRCUIT%20OF%20THE%20AMERICAS', '2024-r06-circuit-of-the-americas', -5, 36, '2024-09-01T18:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/13_2024/06_CIRCUIT%20OF%20THE%20AMERICAS/558_FIA%20WEC/202409011300_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2024-r7-fuji', '07_FUJI%20SPEEDWAY', '2024-r07-fuji-speedway', 9, 36, '2024-09-15T02:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/13_2024/07_FUJI%20SPEEDWAY/559_FIA%20WEC/202409151100_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2024-r8-bahrain', '08_BAHRAIN%20INTERNATIONAL%20CIRCUIT', '2024-r08-bahrain-international-circuit', 3, 36, '2024-11-02T11:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/13_2024/08_BAHRAIN%20INTERNATIONAL%20CIRCUIT/575_FIA%20WEC/202411021400_Race/Hour%208/03_Classification_Race_Hour%208.CSV'],
].map(([id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl]) => ({ id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl }));

const FINAL_2024 = 'https://fiawec.alkamelsystems.com/Results/13_2024/08_BAHRAIN%20INTERNATIONAL%20CIRCUIT/575_FIA%20WEC/Final%20Championships';
const CHAMPIONSHIPS_2024 = [
  { id: 'wec-2024-hypercar-manufacturers', name: 'FIA Hypercar World Endurance Manufacturers’ Championship', entityType: 'manufacturer', classId: 'wec-2024-hypercar', pdfUrl: `${FINAL_2024}/02_2024_Hypercar_World_Endurance_Manufacturers_Championship_After_Bahrain.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2024-hypercar-teams', name: 'FIA World Cup for Hypercar Teams', entityType: 'competitor', classId: 'wec-2024-hypercar', pdfUrl: `${FINAL_2024}/03_2024_FIA_Endurance_Trophy_Hypercar_Teams_After_Bahrain.pdf`, pdfLayout: 'team' },
  { id: 'wec-2024-hypercar-drivers', name: 'FIA Hypercar World Endurance Drivers’ Championship', entityType: 'driver', classId: 'wec-2024-hypercar', pdfUrl: `${FINAL_2024}/01_2024_Hypercar_World_Endurance_Drivers_Championship_After_Bahrain.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2024-lmgt3-teams', name: 'FIA Endurance Trophy for LMGT3 Teams', entityType: 'competitor', classId: 'wec-2024-lmgt3', pdfUrl: `${FINAL_2024}/05_2024_FIA_Endurance_Trophy_LMGT3_Teams_After_Bahrain.pdf`, pdfLayout: 'team' },
  { id: 'wec-2024-lmgt3-drivers', name: 'FIA Endurance Trophy for LMGT3 Drivers', entityType: 'driver', classId: 'wec-2024-lmgt3', pdfUrl: `${FINAL_2024}/04_2024_FIA_Endurance_Trophy_LMGT3_Drivers_After_Bahrain.pdf`, pdfLayout: 'individual' },
];

const EVENTS_2023 = [
  ['wec-2023-r1-sebring', '01_SEBRING', '2023-r01-sebring', -4, 36, '2023-03-17T16:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/12_2023/01_SEBRING/460_FIA%20WEC/202303171200_Race/Hour%208/03_Classification_Race_Hour%208.CSV'],
  ['wec-2023-r2-portimao', '02_AUTODROMO%20DO%20ALGARVE', '2023-r02-autodromo-do-algarve', 1, 37, '2023-04-16T11:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/12_2023/02_AUTODROMO%20DO%20ALGARVE/461_FIA%20WEC/202304161200_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2023-r3-spa', '03_SPA%20FRANCORCHAMPS', '2023-r03-spa-francorchamps', 2, 37, '2023-04-29T10:45:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/12_2023/03_SPA%20FRANCORCHAMPS/469_FIA%20WEC/202304291245_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2023-r4-le-mans', '04_LE%20MANS', '2023-r04-le-mans', 2, 62, '2023-06-10T14:00:00Z', 'le-mans', 'https://fiawec.alkamelsystems.com/Results/12_2023/04_LE%20MANS/474_FIA%20WEC/202306101600_Race/24_Hour%2024/03_Classification_Race_Hour%2024.CSV'],
  ['wec-2023-r5-monza', '05_AUTODROMO%20NAZIONALE%20DI%20MONZA', '2023-r05-autodromo-nazionale-di-monza', 2, 36, '2023-07-09T10:30:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/12_2023/05_AUTODROMO%20NAZIONALE%20DI%20MONZA/479_FIA%20WEC/202307091230_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2023-r6-fuji', '06_FUJI%20SPEEDWAY', '2023-r06-fuji-speedway', 9, 36, '2023-09-10T02:00:00Z', 'standard', 'https://fiawec.alkamelsystems.com/Results/12_2023/06_FUJI%20SPEEDWAY/497_FIA%20WEC/202309101100_Race/Hour%206/03_Classification_Race_Hour%206.CSV'],
  ['wec-2023-r7-bahrain', '07_BAHRAIN%20INTERNATIONAL%20CIRCUIT', '2023-r07-bahrain-international-circuit', 3, 36, '2023-11-04T11:00:00Z', 'extended', 'https://fiawec.alkamelsystems.com/Results/12_2023/07_BAHRAIN%20INTERNATIONAL%20CIRCUIT/513_FIA%20WEC/202311041400_Race/Hour%208/03_Classification_Race_Hour%208.CSV'],
].map(([id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl]) => ({ id, directory, archiveSlug, utcOffsetHours, expectedEntries, startTimeUtc, pointsScale, sourceUrl }));

const FINAL_2023 = 'https://fiawec.alkamelsystems.com/Results/12_2023/07_BAHRAIN%20INTERNATIONAL%20CIRCUIT/513_FIA%20WEC/Final%20Championships';
const CHAMPIONSHIPS_2023 = [
  { id: 'wec-2023-hypercar-manufacturers', name: 'FIA Hypercar World Endurance Manufacturers’ Championship', entityType: 'manufacturer', classId: 'wec-2023-hypercar', pdfUrl: `${FINAL_2023}/2023_Hypercar_World_Endurance_Manufacturers_Championship_After_Bahrain.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2023-hypercar-teams', name: 'FIA World Cup for Hypercar Teams', entityType: 'competitor', classId: 'wec-2023-hypercar', pdfUrl: `${FINAL_2023}/2023_FIA_Endurance_Trophy_Hypercar_Teams_After_Bahrain.pdf`, pdfLayout: 'team', eventRounds: [3, 4, 5, 6, 7] },
  { id: 'wec-2023-hypercar-drivers', name: 'FIA Hypercar World Endurance Drivers’ Championship', entityType: 'driver', classId: 'wec-2023-hypercar', pdfUrl: `${FINAL_2023}/2023_Hypercar_World_Endurance_Drivers_Championship_After_Bahrain.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2023-lmp2-teams', name: 'FIA Endurance Trophy for LMP2 Teams', entityType: 'competitor', classId: 'wec-2023-lmp2', pdfUrl: `${FINAL_2023}/2023_FIA_Endurance_Trophy_LMP2_Teams_After_Bahrain.pdf`, pdfLayout: 'team' },
  { id: 'wec-2023-lmp2-drivers', name: 'FIA Endurance Trophy for LMP2 Drivers', entityType: 'driver', classId: 'wec-2023-lmp2', pdfUrl: `${FINAL_2023}/2023_FIA_Endurance_Trophy_LMP2_Drivers_After_Bahrain.pdf`, pdfLayout: 'individual' },
  { id: 'wec-2023-lmgte-am-teams', name: 'FIA Endurance Trophy for LMGTE Am Teams', entityType: 'competitor', classId: 'wec-2023-lmgte-am', pdfUrl: `${FINAL_2023}/2023_FIA_Endurance_Trophy_LMGTE_Am_Teams_After_Bahrain.pdf`, pdfLayout: 'team' },
  { id: 'wec-2023-lmgte-am-drivers', name: 'FIA Endurance Trophy for LMGTE Am Drivers', entityType: 'driver', classId: 'wec-2023-lmgte-am', pdfUrl: `${FINAL_2023}/2023_FIA_Endurance_Trophy_LMGTE_Am_Drivers_After_Bahrain.pdf`, pdfLayout: 'individual' },
];

const F1DB_CIRCUIT_SOURCE = 'https://github.com/f1db/f1db';
const LE_MANS_MAP_SOURCE = 'https://github.com/tobi/track-atlas/tree/main/tracks/circuit-de-la-sarthe';
const CIRCUITS = [
  { id: 'lusail', name: 'Lusail International Circuit', countryId: 'qatar', placeName: 'Lusail', type: 'RACE', direction: 'CLOCKWISE', latitude: 25.49, longitude: 51.454167, length: 5.419, turns: 16, layoutId: 'lusail-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'imola', name: 'Autodromo Internazionale Enzo e Dino Ferrari', countryId: 'italy', placeName: 'Imola', type: 'RACE', direction: 'ANTI_CLOCKWISE', latitude: 44.341111, longitude: 11.713333, length: 4.909, turns: 19, layoutId: 'imola-3', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'spa-francorchamps', name: 'Circuit de Spa-Francorchamps', countryId: 'belgium', placeName: 'Stavelot', type: 'RACE', direction: 'CLOCKWISE', latitude: 50.437222, longitude: 5.971389, length: 7.004, turns: 19, layoutId: 'spa-francorchamps-4', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'le-mans', name: 'Circuit de la Sarthe', countryId: 'france', placeName: 'Le Mans', type: 'ROAD', direction: 'CLOCKWISE', latitude: 47.95, longitude: 0.2247, length: 13.626, turns: 21, layoutId: 'wec-le-mans-24h', layoutVersion: '2018-present', mapSourceUrl: LE_MANS_MAP_SOURCE },
  { id: 'interlagos', name: 'Autodromo Jose Carlos Pace', countryId: 'brazil', placeName: 'Sao Paulo', type: 'RACE', direction: 'ANTI_CLOCKWISE', latitude: -23.701111, longitude: -46.697222, length: 4.309, turns: 15, layoutId: 'interlagos-2', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'circuit-of-the-americas', name: 'Circuit of the Americas', countryId: 'united-states-of-america', placeName: 'Austin', type: 'RACE', direction: 'ANTI_CLOCKWISE', latitude: 30.132778, longitude: -97.641111, length: 5.513, turns: 20, layoutId: 'austin-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'fuji', name: 'Fuji Speedway', countryId: 'japan', placeName: 'Oyama', type: 'RACE', direction: 'CLOCKWISE', latitude: 35.371667, longitude: 138.926667, length: 4.563, turns: 16, layoutId: 'fuji-2', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'bahrain', name: 'Bahrain International Circuit', countryId: 'bahrain', placeName: 'Sakhir', type: 'RACE', direction: 'CLOCKWISE', latitude: 26.0325, longitude: 50.510556, length: 5.412, turns: 15, layoutId: 'bahrain-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'sebring', name: 'Sebring International Raceway', countryId: 'united-states-of-america', placeName: 'Sebring', type: 'ROAD', direction: 'CLOCKWISE', latitude: 27.454741, longitude: -81.348267, length: 8.36, turns: 17, layoutId: 'sebring-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'algarve', name: 'Algarve International Circuit', countryId: 'portugal', placeName: 'Portimao', type: 'RACE', direction: 'CLOCKWISE', latitude: 37.221944, longitude: -8.629444, length: 4.653, turns: 15, layoutId: 'portimao-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'monza', name: 'Autodromo Nazionale Monza', countryId: 'italy', placeName: 'Monza', type: 'RACE', direction: 'CLOCKWISE', latitude: 45.620556, longitude: 9.289444, length: 5.793, turns: 11, layoutId: 'monza-7', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'silverstone', name: 'Silverstone Circuit', countryId: 'united-kingdom', placeName: 'Silverstone', type: 'RACE', direction: 'CLOCKWISE', latitude: 52.078611, longitude: -1.016944, length: 5.891, turns: 18, layoutId: 'silverstone-8', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'nurburgring', name: 'Nurburgring', countryId: 'germany', placeName: 'Nurburg', type: 'RACE', direction: 'CLOCKWISE', latitude: 50.335556, longitude: 6.9475, length: 5.148, turns: 15, layoutId: 'nurburgring-4', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'mexico-city', name: 'Autodromo Hermanos Rodriguez', countryId: 'mexico', placeName: 'Mexico City', type: 'RACE', direction: 'CLOCKWISE', latitude: 19.404197, longitude: -99.088747, length: 4.304, turns: 17, layoutId: 'mexico-city-3', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
  { id: 'shanghai', name: 'Shanghai International Circuit', countryId: 'china', placeName: 'Shanghai', type: 'RACE', direction: 'CLOCKWISE', latitude: 31.338889, longitude: 121.219722, length: 5.451, turns: 16, layoutId: 'shanghai-1', layoutVersion: 'current', mapSourceUrl: F1DB_CIRCUIT_SOURCE },
];

const EVENT_DETAILS = [
  ['qatar', 'Qatar 1812km', 'lusail', 'distance', '', 1812], ['imola', '6 Hours of Imola', 'imola', 'duration', 360, ''],
  ['spa', '6 Hours of Spa-Francorchamps', 'spa-francorchamps', 'duration', 360, ''], ['le-mans', '24 Hours of Le Mans', 'le-mans', 'duration', 1440, ''],
  ['sao-paulo', '6 Hours of Sao Paulo', 'interlagos', 'duration', 360, ''], ['cota', 'Lone Star Le Mans', 'circuit-of-the-americas', 'duration', 360, ''],
  ['fuji', '6 Hours of Fuji', 'fuji', 'duration', 360, ''], ['bahrain', '8 Hours of Bahrain', 'bahrain', 'duration', 480, ''],
  ['sebring', '1000 Miles of Sebring', 'sebring', 'distance', '', 1609], ['portimao', '6 Hours of Portimao', 'algarve', 'duration', 360, ''],
  ['monza', '6 Hours of Monza', 'monza', 'duration', 360, ''],
];

const SEASONS = [
  { year: 2022, id: 'wec-2022', sourceUrl: 'https://www.fia.com/events/world-endurance-championship/season-2022/standings', events: EVENTS_2022, championships: CHAMPIONSHIPS_2022, standings: 'pdf', classes: [['HYPERCAR', 'Hypercar'], ['LMP2', 'LMP2'], ['LMGTE PRO', 'LMGTE Pro'], ['LMGTE AM', 'LMGTE Am']] },
  { year: 2023, id: 'wec-2023', sourceUrl: 'https://www.fiawec.com/en/news/2023-fia-wec-entry-list-sees-record-hypercar-and-lmgte-am-field/7555', events: EVENTS_2023, championships: CHAMPIONSHIPS_2023, standings: 'pdf', classes: [['HYPERCAR', 'Hypercar'], ['LMP2', 'LMP2'], ['LMGTE AM', 'LMGTE Am'], ['INNOVATIVE CAR', 'Innovative Car']] },
  { year: 2024, id: 'wec-2024', sourceUrl: 'https://www.fia.com/events/world-endurance-championship/season-2024/standings', events: EVENTS_2024, championships: CHAMPIONSHIPS_2024, standings: 'pdf', classes: [['HYPERCAR', 'Hypercar'], ['LMGT3', 'LMGT3'], ['LMP2', 'LMP2 (Le Mans)']] },
  { year: 2025, id: 'wec-2025', sourceUrl: 'https://www.fiawec.com/en/season/2025', events: EVENTS_2025, championships: CHAMPIONSHIPS_2025, standings: 'html', classes: [['HYPERCAR', 'Hypercar'], ['LMGT3', 'LMGT3'], ['LMP2', 'LMP2 (Le Mans)']] },
];
const EVENTS = EVENTS_2025;
const CHAMPIONSHIPS = CHAMPIONSHIPS_2025;

const MANUFACTURER_BY_MODEL = {
  'Alpine A424': 'Alpine', 'Alpine A480 - Gibson': 'Alpine', 'Aston Martin Valkyrie': 'Aston Martin', 'Aston Martin Vantage AMR LMGT3': 'Aston Martin',
  'BMW M Hybrid V8': 'BMW', 'BMW M HYBRID V8': 'BMW', 'BMW M4 LMGT3': 'BMW', 'Cadillac V-Series.R': 'Cadillac',
  'Corvette Z06 LMGT3.R': 'Corvette', 'Ferrari 296 LMGT3': 'Ferrari', 'Ferrari 499P': 'Ferrari',
  'Ford Mustang LMGT3': 'Ford', 'Lexus RC F LMGT3': 'Lexus', 'McLaren 720S LMGT3 Evo': 'McLaren',
  'Isotta Fraschini Tipo6-C': 'Isotta Fraschini', 'Lamborghini Huracan LMGT3 Evo2': 'Lamborghini',
  'Lamborghini SC63': 'Lamborghini', 'Mercedes-AMG LMGT3': 'Mercedes-AMG', 'Oreca 07 - Gibson': 'Oreca', 'Peugeot 9X8': 'Peugeot',
  'Aston Martin Vantage AMR': 'Aston Martin', 'Aston Martin VANTAGE AMR': 'Aston Martin', 'Chevrolet Camaro ZL1': 'Chevrolet', 'Chevrolet Corvette C8.R': 'Chevrolet',
  'Ferrari 488 GTE Evo': 'Ferrari', 'Glickenhaus 007': 'Glickenhaus', 'Glickenhaus 007 LMH': 'Glickenhaus', 'Ligier JSP217 - Gibson': 'Ligier', 'Porsche 911 RSR - 19': 'Porsche',
  'Porsche 911 GT3 R LMGT3': 'Porsche', 'Porsche 963': 'Porsche', 'Toyota GR010 - Hybrid': 'Toyota',
  'Toyota GR010 HYBRID': 'Toyota', 'Vanwall Vandervell 680': 'Vanwall',
};

const LEGACY_SEASONS = [
  ['02_2012', '2012', 2012], ['03_2013', '2013', 2013], ['04_2014', '2014', 2014],
  ['05_2015', '2015', 2015], ['06_2016', '2016', 2016], ['07_2017', '2017', 2017],
  ['08_2018-2019', '2018-2019', 2018], ['09_2019-2020', '2019-2020', 2019], ['10_2021', '2021', 2021],
];

const LEGACY_VENUES = {
  'SEBRING': ['sebring', '1000 Miles of Sebring', 'sebring', 'America/New_York'],
  'SPA FRANCORCHAMPS': ['spa', '6 Hours of Spa-Francorchamps', 'spa-francorchamps', 'Europe/Brussels'],
  'LE MANS': ['le-mans', '24 Hours of Le Mans', 'le-mans', 'Europe/Paris'],
  'SILVERSTONE': ['silverstone', '6 Hours of Silverstone', 'silverstone', 'Europe/London'],
  'INTERLAGOS': ['sao-paulo', '6 Hours of Sao Paulo', 'interlagos', 'America/Sao_Paulo'],
  'BAHRAIN INTERNATIONAL CIRCUIT': ['bahrain', '6 Hours of Bahrain', 'bahrain', 'Asia/Bahrain'],
  'BAHRAIN INTERNATIONAL CIRCUIT 6 HOURS': ['bahrain-6-hours', '6 Hours of Bahrain', 'bahrain', 'Asia/Bahrain'],
  'BAHRAIN INTERNATIONAL CIRCUIT 8 HOURS': ['bahrain-8-hours', '8 Hours of Bahrain', 'bahrain', 'Asia/Bahrain'],
  'FUJI SPEEDWAY': ['fuji', '6 Hours of Fuji', 'fuji', 'Asia/Tokyo'],
  'FUJI SPEED WAY': ['fuji', '6 Hours of Fuji', 'fuji', 'Asia/Tokyo'],
  'SHANGHAI INTERNATIONAL CIRCUIT': ['shanghai', '6 Hours of Shanghai', 'shanghai', 'Asia/Shanghai'],
  'CIRCUIT OF THE AMERICAS': ['cota', 'Lone Star Le Mans', 'circuit-of-the-americas', 'America/Chicago'],
  'NURBURGRING': ['nurburgring', '6 Hours of Nurburgring', 'nurburgring', 'Europe/Berlin'],
  'AUTODROMO HERMANOS RODRIGUEZ': ['mexico-city', '6 Hours of Mexico', 'mexico-city', 'America/Mexico_City'],
  'AUTODROMO DO ALGARVE': ['portimao', '8 Hours of Portimao', 'algarve', 'Europe/Lisbon'],
  'AUTODROMO NAZIONALE DI MONZA': ['monza', '6 Hours of Monza', 'monza', 'Europe/Rome'],
};

const LEGACY_CREW_OVERRIDES = {
  'wec-2013-r3-le-mans:95': ['Allan Simonsen', 'Christoffer Nygaard', 'Kristian Poulsen'],
};

const MANUFACTURER_COUNTRIES = {
  audi: 'germany', hpd: 'united-states-of-america', morgan: 'united-kingdom', pescarolo: 'france', oreca: 'france', zytek: 'united-kingdom',
  lola: 'united-kingdom', ferrari: 'italy', porsche: 'germany', chevrolet: 'united-states-of-america', 'aston-martin': 'united-kingdom', oak: 'france',
  dome: 'japan', norma: 'france', toyota: 'japan', delta: 'united-kingdom', lotus: 'united-kingdom', alpine: 'france', viper: 'united-states-of-america',
  rebellion: 'switzerland', ligier: 'france', nissan: 'japan', clm: 'austria', gibson: 'united-kingdom', strakka: 'united-kingdom', br01: 'russia',
  srt: 'united-states-of-america', ford: 'united-states-of-america', enso: 'austria', dallara: 'italy', riley: 'united-states-of-america', br: 'russia',
  bmw: 'germany', ginetta: 'united-kingdom', aurus: 'russia', glickenhaus: 'united-states-of-america', peugeot: 'france', cadillac: 'united-states-of-america',
  vanwall: 'united-kingdom', lamborghini: 'italy', corvette: 'united-states-of-america', mclaren: 'united-kingdom', lexus: 'japan',
  'isotta-fraschini': 'italy', 'mercedes-amg': 'germany',
};

const DRIVER_COUNTRY_FALLBACKS = {
  'mirco-shultis': 'germany', 'jean-phillipe-belloc': 'france', 'michael-waltrip': 'united-states-of-america',
  'bill-binnie': 'united-states-of-america', 'francois-jakubowski': 'france', 'daniil-kvyat': 'russia',
  'timur-boguslavskiy': 'russia',
};

const DRIVER_CATEGORY_FALLBACKS = {
  'wec-2012:alexandre-negrao': 'bronze', 'wec-2012:bill-binnie': 'silver', 'wec-2012:jonny-cocker': 'gold',
  'wec-2012:matt-griffin': 'silver', 'wec-2012:michael-krumm': 'platinum', 'wec-2012:satoshi-motoyama': 'platinum',
  'wec-2013:abdulaziz-turki-al-faisal': 'silver', 'wec-2013:khaled-al-qubaisi': 'silver', 'wec-2013:rudy-junco': 'silver',
  'wec-2013:tom-kimber-smith': 'gold', 'wec-2013:wolfgang-reip': 'silver',
  'wec-2014:abdulaziz-turki-al-faisal': 'silver', 'wec-2014:alexander-talkanitsa': 'bronze', 'wec-2014:bruno-senna': 'platinum',
  'wec-2014:jean-merlin': 'bronze', 'wec-2014:jordan-taylor': 'gold', 'wec-2014:matt-griffin': 'gold',
  'wec-2014:ricky-taylor': 'gold', 'wec-2014:simon-trummer': 'gold',
  'wec-2015:alexander-mortimer': 'silver', 'wec-2015:jun-san-chen': 'bronze', 'wec-2015:matt-griffin': 'gold',
  'wec-2015:max-chilton': 'platinum', 'wec-2015:nick-jonsson': 'gold', 'wec-2015:william-sweedler': 'bronze',
  'wec-2016:alfonso-diaz-guerra': 'silver', 'wec-2016:ben-barker': 'silver', 'wec-2016:chris-cumming': 'bronze',
  'wec-2016:christopher-hoy': 'bronze', 'wec-2016:ed-brown': 'bronze', 'wec-2016:frederic-sausset': 'bronze',
  'wec-2016:james-jakes': 'gold', 'wec-2016:jean-bernard-bouvet': 'silver', 'wec-2016:jean-philippe-belloc': 'gold',
  'wec-2016:lehman-keen': 'gold', 'wec-2016:lewis-williamson': 'silver', 'wec-2016:matt-griffin': 'gold',
  'wec-2016:nico-pieter-de-bruijn': 'silver', 'wec-2016:robert-bell': 'platinum', 'wec-2016:roberto-merhi': 'platinum',
  'wec-2016:weng-mok': 'bronze', 'wec-2016:william-sweedler': 'bronze',
  'wec-2017:tony-kanaan': 'platinum', 'wec-2017:will-owen': 'silver',
  'wec-2018-2019:edward-cheever': 'silver', 'wec-2018-2019:jonathan-bomarito': 'gold',
  'wec-2018-2019:kei-cozzolino': 'silver', 'wec-2018-2019:miro-konopka': 'bronze',
  'wec-2018-2019:rene-binder': 'silver', 'wec-2018-2019:timothe-buret': 'silver', 'wec-2018-2019:will-owen': 'silver',
  'wec-2018-2019-r1-spa:billy-johnson': 'platinum', 'wec-2018-2019-r2-le-mans:billy-johnson': 'platinum',
  'wec-2018-2019-r6-sebring:billy-johnson': 'gold', 'wec-2018-2019-r8-le-mans:billy-johnson': 'gold',
  'wec-2019-2020:horst-jr-felbermayr': 'bronze', 'wec-2019-2020:juan-pablo-montoya': 'platinum',
  'wec-2019-2020:loic-duval': 'platinum', 'wec-2019-2020:nicholas-tandy': 'platinum',
  'wec-2019-2020:pipo-derani': 'gold', 'wec-2019-2020:will-owen': 'silver',
  'wec-2019-2020-r1-silverstone:job-van-uitert': 'silver', 'wec-2019-2020-r6-spa:job-van-uitert': 'silver',
  'wec-2019-2020-r7-le-mans:job-van-uitert': 'gold',
  'wec-2019-2020-r1-silverstone:kenta-yamashita': 'gold', 'wec-2019-2020-r2-fuji:kenta-yamashita': 'gold',
  'wec-2019-2020-r3-shanghai:kenta-yamashita': 'gold', 'wec-2019-2020-r6-spa:kenta-yamashita': 'gold',
  'wec-2019-2020-r7-le-mans:kenta-yamashita': 'platinum',
  'wec-2024:jack-hawksworth': 'gold', 'wec-2024:kyffin-simpson': 'gold',
};

const TEAM_COUNTRY_FALLBACKS = {
  'starworks-motorsports': 'united-states-of-america', 'pescarolo-team': 'france', 'adr-delta': 'united-kingdom', jrm: 'united-kingdom',
  'team-felbermayr-proton': 'germany', 'af-corse-waltrip': 'italy', 'gulf-racing-middle-east': 'united-arab-emirates',
  'jwa-avila': 'united-kingdom', 'signatech-nissan': 'france', 'luxury-racing': 'france', 'audi-sport-north-america': 'united-states-of-america',
  'boutsen-ginion-racing': 'belgium', 'extreme-limite-aric': 'france', 'extreme-limit-aric': 'france', 'status-gp': 'canada',
  'status-grand-prix': 'canada', 'flying-lizard-motorsports': 'united-states-of-america', 'jmb-racing': 'monaco',
  'level-5-motorsport': 'united-states-of-america', 'level-5-motorsports': 'united-states-of-america', 'prospeed-competition': 'belgium',
  'prospeed-racing': 'belgium', 'highcroft-racing': 'united-states-of-america', 'morand-racing': 'switzerland', 'jota-sport': 'united-kingdom',
  'srt-motorsports': 'united-states-of-america', 'dempsey-del-piero-proton': 'germany', 'hvm-status-gp': 'united-states-of-america',
  'ram-racing': 'united-kingdom', 'sebastien-loeb-racing': 'france', 'newblood-by-morand-racing': 'switzerland',
  'oak-racing-team-asia': 'france', 'dempsey-racing-proton': 'germany', 'caterham-racing': 'united-kingdom', 'team-taisan': 'japan',
  'team-sofrev-asp': 'france', 'nissan-motorsports-global': 'japan', 'ibanez-racing': 'spain', 'nissan-motorsports': 'japan',
  'riley-motorsports-ti-auto': 'united-states-of-america', 'eurasia-motorsport': 'hong-kong', 'hub-auto-racing': 'taiwan',
  'racing-team-india-eurasia': 'india', 'manthey-purerxcing': 'germany', 'clx-pure-rxcing': 'switzerland',
};

const DRIVER_CATEGORY = { P: 'platinum', G: 'gold', S: 'silver', B: 'bronze' };

const ENTRY_LIST_METADATA_SOURCES = [
  { seasonId: 'wec-2012', cacheName: 'wec-2012-full-season-entry-list.pdf', url: 'https://news.verstappen.com/pdf/2012_Le_Mans/2012-02-02_FIA_WEC_2012-Provisional_entry_list.pdf' },
  { seasonId: 'wec-2012', cacheName: 'wec-2012-sebring-entry-list.pdf', url: 'https://motorsport.nextgen-auto.com/IMG/pdf/Sebring_Entry_2012.pdf' },
  { seasonId: 'wec-2012', cacheName: 'wec-2012-spa-entry-list.pdf', url: 'https://www.endurance-info.com/sites/default/files/import/classic/36420/EntryListSpa.pdf' },
  { seasonId: 'wec-2012', cacheName: 'wec-2012-fuji-entry-list.pdf', url: 'https://www.alainprost.net/nicraces/2012/wec_fuji_entry.pdf' },
  { seasonId: 'wec-2013', cacheName: 'wec-2013-fuji-entry-list.pdf', url: 'https://www.fia.com/sites/default/files/entry_lists_decisions/files/FIAWEC2013_6_hours_of_Fuji_081013.pdf' },
  { seasonId: 'wec-2015', cacheName: 'wec-2015-bahrain-entry-list.pdf', url: 'https://www.fia.com/file/36331/download?token=4qR20KeO' },
  { seasonId: 'wec-2016', cacheName: 'wec-2016-bahrain-entry-list.pdf', url: 'https://www.fia.com/sites/default/files/fiawec2016_6_hours_of_bahrain_provisional_entry_list_061116.pdf' },
  { seasonId: 'wec-2017', cacheName: 'wec-2017-bahrain-entry-list.pdf', url: 'https://fiawec.alkamelsystems.com/Results/07_2017/09_BAHRAIN%20INTERNATIONAL%20CIRCUIT/00_Event%20Info/Entry%20List.pdf' },
  { seasonId: 'wec-2018-2019', cacheName: 'wec-2018-2019-le-mans-entry-list.pdf', url: 'https://fiawec.alkamelsystems.com/Results/08_2018-2019/08_LE%20MANS/Event%20Info/Entry%20list.pdf' },
  { seasonId: 'wec-2019-2020', cacheName: 'wec-2019-2020-bahrain-entry-list.pdf', url: 'https://fiawec.alkamelsystems.com/Results/09_2019-2020/08_BAHRAIN%20INTERNATIONAL%20CIRCUIT/00_Event%20Information/Entry_list.pdf' },
  { seasonId: 'wec-2021', cacheName: 'wec-2021-bahrain-entry-list.pdf', url: 'https://fiawec.alkamelsystems.com/Results/10_2021/06_BAHRAIN%20INTERNATIONAL%20CIRCUIT%208%20HOURS/000_EVENT%20INFORMATION/Provisional%20Entry%20List.pdf' },
];

const DRIVER_CATEGORISATION_SOURCES = [
  { seasonIds: ['wec-2012', 'wec-2013'], cacheName: 'wec-2012-2013-driver-categorisations.pdf', url: 'https://motorsport.nextgen-auto.com/IMG/pdf/PilotesCategories.pdf' },
  { seasonIds: ['wec-2013', 'wec-2014'], cacheName: 'wec-2013-2014-driver-categorisations.pdf', url: 'https://cdn1p.abcdocz.com/store/data/000322694.pdf?k=AwAAAaCn-LHjAAACWNlpL60BMOzOp3uaodZIFTdFAF_M' },
  { seasonIds: ['wec-2015'], cacheName: 'fia-2015-driver-categorisations.pdf', url: 'https://www.fia.com/file/26761/download' },
  { seasonIds: ['wec-2016'], cacheName: 'fia-2016-driver-categorisations.pdf', url: 'https://www.fia.com/sites/default/files/drivers_categorisation_list_120516.pdf' },
  { seasonIds: ['wec-2017'], cacheName: 'fia-2017-driver-categorisations.pdf', url: 'https://www.fia.com/file/50676/download' },
];

const POINTS = {
  standard: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  extended: [38, 27, 23, 18, 15, 12, 9, 6, 3, 2],
  'le-mans': [50, 36, 30, 24, 20, 16, 12, 8, 4, 2],
};

function slug(value) {
  return String(value || '').replace(/[øØ]/g, 'o').replace(/[æÆ]/g, 'ae').replace(/[łŁ]/g, 'l')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function milliseconds(value) {
  if (!value) return '';
  const parts = String(value).replace(/'/g, ':').split(':').map(Number);
  if (parts.some(Number.isNaN)) return '';
  let seconds = 0;
  while (parts.length > 1) seconds = (seconds + parts.shift()) * 60;
  return Math.round((seconds + parts[0]) * 1000);
}

function displayName(value) {
  return String(value || '').trim().toLowerCase().replace(/(^|[\s'-])\p{L}/gu, match => match.toUpperCase());
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

async function countryIdsByCode() {
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(path.join(DATA_DIRECTORY, 'f1db-countries.csv')).pipe(csv())
      .on('data', row => rows.push(row)).on('error', reject).on('end', resolve);
  });
  const countries = new Map();
  for (const row of rows) {
    for (const code of [row.alpha2Code, row.alpha3Code, row.iocCode]) {
      if (code) countries.set(String(code).trim().toUpperCase(), row.id);
    }
  }
  // The official timing feed uses these historical/sporting codes.
  countries.set('GBR', 'united-kingdom');
  countries.set('USA', 'united-states-of-america');
  countries.set('UAE', 'united-arab-emirates');
  countries.set('KOR', 'south-korea');
  countries.set('TPE', 'taiwan');
  return countries;
}

function driverDetails(row, index, countries) {
  const countryCode = String(row[`DRIVER${index}_COUNTRY`] || '').trim().toUpperCase();
  const categoryCode = String(row[`DRIVER${index}_LICENSE`] || '').trim().toUpperCase();
  return {
    countryId: countries.get(countryCode) || '',
    category: DRIVER_CATEGORY[categoryCode] || '',
    abbreviation: String(row[`DRIVER${index}_SHORTNAME`] || '').trim().toUpperCase(),
    ecmCountryId: String(row[`DRIVER${index}_ECM Country Id`] || '').trim(),
  };
}

async function entryListMetadata(countries, additionalSources = []) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const drivers = new Map();
  const teams = new Map();
  const sources = [...ENTRY_LIST_METADATA_SOURCES, ...additionalSources]
    .filter((source, index, all) => all.findIndex(candidate => candidate.url === source.url) === index);
  for (const source of sources) {
    const document = await getDocument({ data: new Uint8Array(await cachedBuffer(source.cacheName, source.url)) }).promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const rotated = Math.abs(page.rotate) % 180 !== 0;
      const lines = new Map();
      for (const item of content.items.filter(item => item.str.trim())) {
        const row = String(Math.round(item.transform[rotated ? 4 : 5]));
        if (!lines.has(row)) lines.set(row, []);
        lines.get(row).push({ text: item.str.trim(), column: item.transform[rotated ? 5 : 4] });
      }
      for (const items of lines.values()) {
        items.sort((left, right) => left.column - right.column);
        const numberIndex = items.findIndex(item => /^\d+[A-Za-z]?$/.test(item.text));
        if (numberIndex >= 0) {
          const teamName = items[numberIndex + 1]?.text.replace(/[°*]+$/, '').trim();
          const countryCode = items.slice(numberIndex + 2).find(item => countries.has(item.text.toUpperCase()))?.text.toUpperCase();
          if (teamName && countryCode) teams.set(slug(teamName), countries.get(countryCode));
        }
        for (const [index, item] of items.entries()) {
          const match = item.text.replace(/°$/, '').match(/^(.+?)\s+\(([A-Z]{3})\)$/u);
          if (match) {
            const categoryCode = items.slice(index + 1).find(candidate => /^[PGSB]$/.test(candidate.text))?.text;
            drivers.set(`${source.seasonId}:${slug(match[1])}`, {
              countryId: countries.get(match[2]) || '', category: DRIVER_CATEGORY[categoryCode] || '',
            });
            continue;
          }
          const countryIndex = items.findIndex((candidate, candidateIndex) => candidateIndex > index
            && candidate.column - item.column < 100 && countries.has(candidate.text.toUpperCase()));
          if (countryIndex < 0) continue;
          const category = items.slice(countryIndex + 1).find(candidate => candidate.column - items[countryIndex].column < 40 && /^[PGSB]$/.test(candidate.text));
          if (!category || !/[\p{L}]{2}/u.test(item.text)) continue;
          drivers.set(`${source.seasonId}:${slug(item.text.replace(/^\*+/, ''))}`, {
            countryId: countries.get(items[countryIndex].text.toUpperCase()) || '', category: DRIVER_CATEGORY[category.text] || '',
          });
        }
      }
    }
  }
  for (const source of DRIVER_CATEGORISATION_SOURCES) {
    const document = await getDocument({ data: new Uint8Array(await cachedBuffer(source.cacheName, source.url)) }).promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map();
      for (const item of content.items.filter(item => item.str.trim())) {
        const row = String(Math.round(item.transform[5]));
        if (!lines.has(row)) lines.set(row, []);
        lines.get(row).push({ text: item.str.trim(), column: item.transform[4] });
      }
      for (const items of lines.values()) {
        items.sort((left, right) => left.column - right.column);
        const categoryItems = items.filter(item => /^(?:Platinum|Gold|Silver|Bronze|-)$/i.test(item.text));
        if (categoryItems.length < source.seasonIds.length) continue;
        const name = items.filter(item => item.column < categoryItems[0].column && /\p{L}/u.test(item.text))
          .map(item => item.text).join(' ').replace(/\s*[‐-]\s*/g, '-').trim();
        if (!name || /^(?:name|drivers)$/i.test(name)) continue;
        const nameParts = name.trim().split(/\s+/);
        const displayOrderName = nameParts.length > 1 ? [nameParts.at(-1), ...nameParts.slice(0, -1)].join(' ') : name;
        for (const [index, seasonId] of source.seasonIds.entries()) {
          const category = categoryItems[index]?.text.toLowerCase();
          if (!Object.values(DRIVER_CATEGORY).includes(category)) continue;
          for (const driverName of [name, displayOrderName]) {
            drivers.set(`${seasonId}:${slug(driverName)}`, { countryId: '', category });
          }
        }
      }
    }
  }
  return { drivers, teams };
}

function decodeHtml(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, '’').replace(/&eacute;/g, 'é').replace(/&uuml;/g, 'ü');
}

function textFromHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function selectOptions(html, name) {
  const select = html.match(new RegExp(`<select[^>]+name=["']${name}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'))?.[1] || '';
  return [...select.matchAll(/<option[^>]+value=["']([^"']+)["'][^>]*>([^<]*)<\/option>/gi)]
    .map(match => ({ value: match[1], label: decodeHtml(match[2]).trim() }));
}

function officialLinks(html) {
  return [...html.matchAll(/(?:href|src)=["']([^"']*Results\/[^"']+)/gi)]
    .map(match => new URL(decodeHtml(match[1]), `${TIMING_ORIGIN}/`).href)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function entryListUrlFromHtml(html) {
  return officialLinks(html).filter(url => /entry(?:%20|[ _-])*list.*\.pdf/i.test(url) && !/prologue/i.test(url)).at(-1) || '';
}

function legacyChampionships(html, seasonId, seriesPrefix) {
  const eventPrefix = seriesPrefix.replace(/[^/]+\/$/, '');
  const documents = [...html.matchAll(/<a[^>]+href=["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
    url: new URL(decodeHtml(match[1]), `${TIMING_ORIGIN}/`).href,
    label: textFromHtml(match[2]).replace(/\s+/g, ' ').trim(),
  })).filter(document => (document.url.startsWith(seriesPrefix) || (document.url.startsWith(eventPrefix) && /final(?:%20|\s)+championship/i.test(document.url)))
      && /championship|troph|world cup/i.test(`${document.label} ${document.url}`))
    .filter((document, index, all) => all.findIndex(other => other.url === document.url) === index);
  const championships = [];
  for (const document of documents) {
    const text = `${document.label} ${decodeURIComponent(document.url)}`.toUpperCase();
    if (/^2012 TEAMS TROPHY AFTER/.test(document.label.toUpperCase())) {
      for (const [classCode, qualifier, section] of [
        ['LMP1', '-private', 'Private LMP1 Teams'], ['LMP2', '', 'LMP2 Teams'],
        ['LMGTE PRO', '', 'LMGTE Pro Teams'], ['LMGTE AM', '', 'LMGTE Am Teams'],
      ]) {
        championships.push({ id: `${seasonId}-${slug(classCode)}${qualifier}-teams`, name: `FIA Endurance Trophy for ${section}`,
          entityType: 'team', classId: classIdFor(seasonId, classCode), pdfUrl: document.url, pdfSection: section });
      }
      continue;
    }
    if (/^\d{4} TEAMS TROPHY AFTER/.test(document.label.toUpperCase())) continue;
    let entityType = /MANUFACTUR/.test(text) ? 'manufacturer' : /DRIVER/.test(text) ? 'driver' : /TEAM/.test(text) ? 'competitor' : '';
    if (!entityType && /(?:LMP1|HYPERCAR).*WORLD ENDURANCE CHAMPIONSHIP/.test(text)) entityType = 'team';
    if (!entityType) continue;
    const classCode = /HYPERCAR/.test(text) ? 'HYPERCAR' : /LMP2/.test(text) ? 'LMP2' : /LMP1|LMP(?:_|\s)+WORLD/.test(text) ? 'LMP1'
      : /(?:LM)?GTE?(?:_|\s)+AM/.test(text) ? 'LMGTE AM' : /GTE|\bGT\b/.test(text) ? 'LMGTE PRO' : 'LMP1';
    const qualifier = /PRO(?:\/|_|\s*)AM/.test(text) ? '-pro-am' : /PRIVATE/.test(text) ? '-private' : '';
    const entityLabel = entityType === 'manufacturer' ? 'manufacturers' : ['competitor', 'team'].includes(entityType) ? 'teams' : 'drivers';
    championships.push({ id: `${seasonId}-${slug(classCode)}${qualifier}-${entityLabel}`, name: document.label, entityType,
      classId: classIdFor(seasonId, classCode), pdfUrl: document.url });
  }
  return championships.filter((championship, index, all) => all.findIndex(other => other.id === championship.id) === index);
}

async function timingPage(parameters, cacheName = '') {
  const cachePath = cacheName ? path.join(CACHE_DIRECTORY, cacheName) : '';
  if (cachePath && !refresh && fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf8');
  const response = await fetch(`${TIMING_ORIGIN}/`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Racelytic WEC data collector' },
    body: new URLSearchParams(parameters),
  });
  if (!response.ok) throw new Error(`Could not load official timing index: ${response.status}`);
  const content = await response.text();
  if (cachePath) {
    fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
    fs.writeFileSync(cachePath, content, 'utf8');
  }
  return content;
}

function utcOffsetFor(timestamp, timeZone) {
  const year = Number(timestamp.slice(0, 4)), month = Number(timestamp.slice(4, 6)), day = Number(timestamp.slice(6, 8));
  const hour = Number(timestamp.slice(8, 10)), minute = Number(timestamp.slice(10, 12));
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(guess).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - guess.getTime()) / 3600000;
}

async function discoverLegacySeasons() {
  const seasons = [];
  for (const [seasonKey, label, year] of LEGACY_SEASONS) {
    const index = await timingPage({ season: seasonKey }, `${seasonKey}-index.html`);
    const eventOptions = selectOptions(index, 'evvent').filter(event => !/^00_|prologue|test/i.test(event.value));
    const events = [];
    let finalEventHtml = '';
    let finalSeriesPrefix = '';
    for (const [eventIndex, option] of eventOptions.entries()) {
      const venue = LEGACY_VENUES[option.label];
      if (!venue) throw new Error(`${label}: unknown legacy venue ${option.label}`);
      const html = await timingPage({ evvent: option.value, season: seasonKey }, `${seasonKey}-${slug(option.value)}.html`);
      const links = officialLinks(html);
      const allClassifications = links.filter(url => /\/\d+_Classification[^/]*\.CSV$/i.test(url));
      const raceSources = allClassifications.filter(url => /_Race\//i.test(url) && /_Classification_Race/i.test(url));
      const sourceUrl = raceSources.sort((left, right) => {
        const score = url => (/FIA(?:%20|\s)+(?:WEC|WORLD)|WORLD(?:%20|\s)+ENDURANCE/i.test(url) ? 1000 : 0) + Number(url.match(/Hour%20(\d+)/i)?.[1] || 0);
        return score(left) - score(right);
      }).at(-1);
      if (!sourceUrl) throw new Error(`${label}/${option.label}: final race classification not found`);
      const seriesPrefix = sourceUrl.replace(/\/\d{12}_Race\/[\s\S]*$/i, '/');
      const classifications = allClassifications.filter(url => url.startsWith(seriesPrefix));
      const raceTimestamp = sourceUrl.match(/\/(\d{12})_Race\//i)?.[1];
      if (!raceTimestamp) throw new Error(`${label}/${option.label}: race timestamp not found`);
      const sessionSources = classifications.map(url => {
        const match = url.match(/\/(\d{12})_([^/]+)\/\d+_Classification/i);
        if (!match) return null;
        const name = decodeURIComponent(match[2]);
        if (!/^(?:Free Practice|Qualifying|Hyperpole|Warm Up)/i.test(name) || /test/i.test(name)) return null;
        return { timestamp: match[1], name, url };
      }).filter(Boolean).filter((source, sourceIndex, all) => all.findIndex(other => slug(other.name) === slug(source.name)) === sourceIndex)
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      const utcOffsetHours = utcOffsetFor(raceTimestamp, venue[3]);
      const eventId = `wec-${label}-r${eventIndex + 1}-${venue[0]}`;
      const duration = /LE MANS/i.test(option.label) ? 1440 : /8 HOURS/i.test(option.label) || /Hour%208/i.test(sourceUrl) ? 480 : 360;
      events.push({ id: eventId, directory: option.value, archiveSlug: '', utcOffsetHours, expectedEntries: null,
        startTimeUtc: sessionStart(raceTimestamp, utcOffsetHours), pointsScale: duration === 1440 ? 'le-mans' : duration === 480 || /SEBRING/i.test(option.label) ? 'extended' : 'standard',
        sourceUrl, sessionSources, entryListUrl: entryListUrlFromHtml(html), eventName: venue[1], circuitId: venue[2], formatType: /SEBRING/i.test(option.label) ? 'distance' : 'duration',
        scheduledMinutes: /SEBRING/i.test(option.label) ? '' : duration, scheduledDistanceKm: /SEBRING/i.test(option.label) ? 1609 : '' });
      if (eventIndex === eventOptions.length - 1) {
        finalEventHtml = html;
        finalSeriesPrefix = seriesPrefix;
      }
    }
    const classes = year === 2021
      ? [['HYPERCAR', 'Hypercar'], ['LMP2', 'LMP2'], ['LMGTE PRO', 'LMGTE Pro'], ['LMGTE AM', 'LMGTE Am'], ['INNOVATIVE CAR', 'Innovative Car']]
      : [['LMP1', 'LMP1'], ['LMP2', 'LMP2'], ['LMGTE PRO', 'LMGTE Pro'], ['LMGTE AM', 'LMGTE Am']];
    if ([2012, 2014, 2016].includes(year)) classes.push(['CDNT', 'Experimental']);
    const seasonId = `wec-${label}`;
    seasons.push({ year, label, id: seasonId, sourceUrl: `${TIMING_ORIGIN}/?season=${seasonKey}`, events,
      championships: legacyChampionships(finalEventHtml, seasonId, finalSeriesPrefix), standings: 'pdf', classes });
  }
  return seasons;
}

function parseRows(content) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from([content.replace(/^\uFEFF/, '')]).pipe(csv({ separator: ';', mapHeaders: ({ header }) => header.trim() }))
      .on('data', row => rows.push(row)).on('error', reject).on('end', () => resolve(rows));
  });
}

function quote(value) {
  if (value === null || value === undefined) return '';
  const string = String(value);
  return /[",\r\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

function writeCsv(filename, headers, rows) {
  const content = [headers.join(','), ...rows.map(row => headers.map(header => quote(row[header])).join(','))].join('\n') + '\n';
  fs.writeFileSync(path.join(DATA_DIRECTORY, filename), content, 'utf8');
}

async function cachedText(cacheName, url) {
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const cachePath = path.join(CACHE_DIRECTORY, cacheName);
  if (!refresh && fs.existsSync(cachePath)) return fs.readFileSync(cachePath, 'utf8');
  const response = await fetch(url, { headers: { 'user-agent': 'Racelytic WEC data collector' } });
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const content = await response.text();
  if (content.length < 500) throw new Error(`Unexpectedly short response from ${url}`);
  fs.writeFileSync(cachePath, content, 'utf8');
  return content;
}

async function cachedBuffer(cacheName, url, { force = false } = {}) {
  fs.mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const cachePath = path.join(CACHE_DIRECTORY, cacheName);
  if (!refresh && !force && fs.existsSync(cachePath)) return fs.readFileSync(cachePath);
  const response = await fetch(url, { headers: { 'user-agent': 'Racelytic WEC data collector' } });
  if (!response.ok) throw new Error(`Could not fetch ${url}: ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  if (content.length < 1000) throw new Error(`Unexpectedly short response from ${url}`);
  fs.writeFileSync(cachePath, content);
  return content;
}

function championshipPdfMatches(championship, text) {
  const expected = String(championship.name || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const actual = String(text || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const expectations = [];
  if (/\bLMP2\b/.test(expected)) expectations.push(/\bLMP2\b/);
  else if (/\bLMP1\b/.test(expected)) expectations.push(/\bLMP1\b/);
  else if (/\bLMP\b/.test(expected)
      && !(/\bLMP\b/.test(actual) || (/WORLD ENDURANCE DRIVERS CHAMPIONSHIP/.test(actual) && !/\bGTE?\b|\bLMGTE\b/.test(actual)))) return false;
  if (/\b(?:LM)?GT(?:E)?\s+AM\b/.test(expected)) expectations.push(/\b(?:LM)?GT(?:E)?\s+AM\b/);
  else if (/\b(?:LM)?GT(?:E)?\s+PRO\b/.test(expected)) expectations.push(/\b(?:LM)?GT(?:E)?(?:\s+PRO)?\b/);
  else if (/\b(?:LM)?GT(?:E)?\b/.test(expected)) expectations.push(/\b(?:LM)?GT(?:E)?\b/);
  if (/\bHYPERCAR\b/.test(expected)) expectations.push(/\bHYPERCAR\b/);
  if (/\bLMGT3\b/.test(expected)) expectations.push(/\bLMGT3\b/);
  if (/\bMANUFACTURERS?\b/.test(expected)) expectations.push(/\bMANUFACTURERS?\b/);
  if (/\bDRIVERS?\b/.test(expected)) expectations.push(/\bDRIVERS?\b/);
  if (/\bTEAMS?\b/.test(expected) || championship.entityType === 'competitor') expectations.push(/\bTEAMS?\b/);
  return expectations.every(expression => expression.test(actual));
}

function championshipClassIds(championship, season) {
  if (Array.isArray(championship.classIds) && championship.classIds.length) return championship.classIds;
  const codes = season.classes.map(([code]) => code);
  const idsFor = wanted => wanted.filter(code => codes.includes(code)).map(code => classIdFor(season.id, code));
  const name = String(championship.name || '').toUpperCase();
  if (season.year === 2012 && championship.entityType === 'driver' && /DRIVERS WORLD CHAMPIONSHIP/.test(name)) {
    return idsFor(codes);
  }
  if (championship.entityType === 'driver' && season.year <= 2020 && /\bLMP\b.*WORLD ENDURANCE DRIVERS|\bLMP\b.*DRIVERS CHAMPIONSHIP/.test(name)) {
    return idsFor(['LMP1', 'LMP2']);
  }
  if (['driver', 'manufacturer'].includes(championship.entityType)
      && championship.classId.endsWith('-lmgte-pro')
      && !/\b(?:TROPHY|PRO)\b/.test(name)) {
    return idsFor(['LMGTE PRO', 'LMGTE AM']);
  }
  return [championship.classId];
}

async function discoverClassificationUrl(event) {
  if (!discover) return event.sourceUrl;
  const year = Number(event.id.match(/^wec-(\d{4})-/)?.[1]);
  const selector = `${TIMING_ORIGIN}/Results/${year - 2011}_${year}/`;
  try {
    const html = await cachedText('timing-index.html', selector);
    const decodedDirectory = decodeURIComponent(event.directory).replace(/ /g, '(?:%20| )');
    const expression = new RegExp(`href=["']([^"']*${decodedDirectory}[^"']*03_Classification_Race_Hour[^"']*\\.CSV)["']`, 'i');
    const match = html.match(expression);
    if (match) return new URL(decodeHtml(match[1]), selector).href;
  } catch (error) {
    console.warn(`Discovery unavailable for ${event.id}: ${error.message}`);
  }
  return event.sourceUrl;
}

async function discoverSessionSources(event) {
  const indexUrl = `https://wecengine.com/events/${event.archiveSlug}`;
  const html = await cachedText(`${event.id}-sources.html`, indexUrl);
  const urls = [...html.matchAll(/href="(https:\/\/fiawec\.alkamelsystems\.com\/[^"?]+\.CSV)"/gi)]
    .map(match => decodeHtml(match[1])).filter((url, index, all) => all.indexOf(url) === index);
  return urls.map(url => {
    const match = url.match(/\/(\d{12})_([^/]+)\/03_Classification_/i);
    if (!match) return null;
    const name = decodeURIComponent(match[2]);
    if (name.includes('Test') || !(/^(?:Free Practice|Qualifying|Hyperpole|Warm Up)/i.test(name))) return null;
    return { timestamp: match[1], name, url };
  }).filter(Boolean).sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function sessionStart(timestamp, utcOffsetHours) {
  const year = Number(timestamp.slice(0, 4)), month = Number(timestamp.slice(4, 6)) - 1, day = Number(timestamp.slice(6, 8));
  const hour = Number(timestamp.slice(8, 10)) - utcOffsetHours, minute = Number(timestamp.slice(10, 12));
  return new Date(Date.UTC(year, month, day, hour, minute)).toISOString();
}

function sessionType(name) {
  if (/warm\s*up/i.test(name)) return 'warm-up';
  if (/hyperpole/i.test(name)) return 'hyperpole';
  if (/qualifying/i.test(name)) return 'qualifying';
  return 'practice';
}

function normalizedClassCode(value) {
  const code = String(value || '').toUpperCase();
  const compact = code.replace(/\s+/g, '');
  if (compact.startsWith('LMP1')) return 'LMP1';
  if (compact.startsWith('LMP2')) return 'LMP2';
  if (compact.startsWith('LMGTEPRO')) return 'LMGTE PRO';
  if (compact.startsWith('LMGTEAM')) return 'LMGTE AM';
  return code;
}

function manufacturerForModel(model) {
  if (MANUFACTURER_BY_MODEL[model]) return MANUFACTURER_BY_MODEL[model];
  const known = ['Aston Martin', 'Isotta Fraschini', 'Mercedes-AMG', 'Alpine', 'Audi', 'BMW', 'ByKolles', 'Chevrolet', 'Corvette', 'Dome', 'Ferrari', 'Ford', 'Ginetta', 'Glickenhaus', 'HPD', 'Lamborghini', 'Lexus', 'Ligier', 'Lola', 'Lotus', 'McLaren', 'Morgan', 'Nissan', 'Oreca', 'Peugeot', 'Porsche', 'Rebellion', 'Toyota', 'Vanwall', 'Zytek'];
  const manufacturer = known.find(name => String(model).toLowerCase().startsWith(name.toLowerCase()));
  if (manufacturer) return manufacturer === 'Corvette' ? 'Chevrolet' : manufacturer;
  const inferred = String(model).split(/\s+-\s+|\s+/)[0];
  if (inferred) return inferred;
  throw new Error(`Unknown manufacturer for model: ${model}`);
}

function classIdFor(seasonId, classCode) {
  return `${seasonId}-${slug(classCode)}`;
}

function isChampionshipEligible(season, classCode) {
  return classCode !== 'INNOVATIVE CAR' && !(season.year >= 2024 && classCode === 'LMP2');
}

function tableRows(html, tableId) {
  const marker = `id="results-${tableId}"`;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Standings table results-${tableId} not found`);
  const tableEnd = html.indexOf('</table>', start);
  return [...html.slice(start, tableEnd).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => ({
      html: cell[1], text: textFromHtml(cell[1]),
    }));
    return cells;
  }).filter(cells => cells.length);
}

function competitorId(classCode, carNumber, seasonId = 'wec-2025') {
  return `${classIdFor(seasonId, classCode)}-${String(carNumber).toLowerCase()}`;
}

function manufacturerIdFromText(value) {
  const upper = String(value).toUpperCase();
  const names = [...new Set([...Object.values(MANUFACTURER_BY_MODEL), 'Audi', 'Rebellion', 'SMP', 'ByKolles', 'Nissan', 'Pescarolo'])].sort((a, b) => b.length - a.length);
  return slug(names.find(name => upper.includes(name.toUpperCase())) || value);
}

function parseStandings(html, season = SEASONS[1]) {
  const standings = [];
  for (const championship of season.championships) {
    const entities = [];
    for (const cells of tableRows(html, championship.tableId)) {
      const finalPosition = Number(cells[0]?.text.replace(/\D/g, ''));
      const totalPoints = Number(cells.at(-1)?.text.replace(/[^\d.]/g, ''));
      if (!finalPosition || !Number.isFinite(totalPoints)) continue;
      let entityIds = [];
      let pointsStart = 0;
      if (championship.entityType === 'manufacturer') {
        entityIds = [manufacturerIdFromText(cells[1]?.text)];
        pointsStart = 2;
      } else if (championship.entityType === 'competitor') {
        const carNumber = cells[2]?.text.match(/[A-Za-z0-9]+/)?.[0];
        if (carNumber) entityIds = [competitorId(championship.classId.endsWith('hypercar') ? 'HYPERCAR' : 'LMGT3', carNumber, season.id)];
        pointsStart = 4;
      } else {
        entityIds = [...cells[3].html.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi)].map(match => slug(textFromHtml(match[1])));
        if (!entityIds.length) entityIds = cells[3].text.split(/\s*\/\s*/).map(slug).filter(Boolean);
        pointsStart = 4;
      }
      const eventPoints = cells.slice(pointsStart, -1).map(cell => [...cell.text.matchAll(/\d+(?:\.\d+)?/g)].reduce((sum, match) => sum + Number(match[0]), 0));
      if (eventPoints.length !== season.events.length) throw new Error(`${championship.id}: expected ${season.events.length} event point cells, found ${eventPoints.length}`);
      if (Math.abs(eventPoints.reduce((sum, value) => sum + value, 0) - totalPoints) > 0.01) throw new Error(`${championship.id}/${entityIds[0]}: event points do not match the official total`);
      for (const entityId of [...new Set(entityIds)]) entities.push({ entityId, finalPosition, eventPoints });
    }
    for (let round = 1; round <= season.events.length; round += 1) {
      const totals = entities.map(entity => ({ ...entity, points: entity.eventPoints.slice(0, round).reduce((sum, value) => sum + value, 0) }));
      for (const entity of totals) {
        const position = round === season.events.length ? entity.finalPosition : 1 + totals.filter(other => other.points > entity.points).length;
        standings.push({ championshipId: championship.id, round, position, entityId: entity.entityId, points: entity.points, championshipWon: round === season.events.length && entity.finalPosition === 1 });
      }
    }
  }
  return standings;
}

function poleRoundsForChampionship(championship, season, sessions, results, entries, crews) {
  const rounds = new Map();
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  for (const [roundIndex, event] of season.events.entries()) {
    const standingRoundIndex = championship.eventRounds ? championship.eventRounds.indexOf(roundIndex + 1) : roundIndex;
    if (standingRoundIndex < 0) continue;
    const candidates = sessions.filter(session => session.eventId === event.id && ['hyperpole', 'qualifying'].includes(session.type))
      .sort((left, right) => (left.type === right.type ? String(right.startTimeUtc).localeCompare(String(left.startTimeUtc)) : left.type === 'hyperpole' ? -1 : 1));
    let poleResult;
    for (const session of candidates) {
      poleResult = results.find(result => result.sessionId === session.id && result.classId === championship.classId && Number(result.classPosition) === 1);
      if (poleResult) break;
    }
    if (!poleResult) continue;
    const entry = entriesById.get(poleResult.entryId);
    let entityIds = [];
    if (championship.entityType === 'manufacturer') entityIds = [entry.manufacturerId];
    if (championship.entityType === 'competitor') entityIds = [entry.competitorId];
    if (championship.entityType === 'team') entityIds = [entry.teamId];
    if (championship.entityType === 'driver') entityIds = crews.filter(crew => crew.entryId === entry.id && crew.championshipEligible).map(crew => crew.driverId);
    for (const entityId of entityIds) {
      if (!rounds.has(entityId)) rounds.set(entityId, new Set());
      rounds.get(entityId).add(standingRoundIndex);
    }
  }
  return rounds;
}

async function parsePdfStandings(championship, season, context = {}) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let document;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const buffer = await cachedBuffer(`${championship.id}.pdf`, championship.pdfUrl, { force: attempt === 1 });
    document = await getDocument({ data: new Uint8Array(buffer) }).promise;
    const firstPage = await document.getPage(1);
    const firstPageContent = await firstPage.getTextContent();
    const firstPageText = firstPageContent.items.map(item => item.str).join(' ');
    if (championshipPdfMatches(championship, firstPageText)) break;
    if (typeof document.cleanup === 'function') await document.cleanup();
    document = null;
  }
  if (!document) throw new Error(`${championship.id}: downloaded PDF does not match the championship title`);
  const entities = [];
  const championshipClass = season.classes.find(([code]) => classIdFor(season.id, code) === championship.classId)?.[0];
  const standingRounds = championship.eventRounds || season.events.map((event, index) => index + 1);
  let roundMarkers = [];
  let pointMarkers = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const markerLines = new Map();
    for (const item of content.items.filter(item => /^Round \d+/.test(item.str.trim()))) {
      const y = Math.round(item.transform[5] * 2) / 2;
      if (!markerLines.has(y)) markerLines.set(y, []);
      markerLines.get(y).push({ round: Number(item.str.match(/\d+/)[0]), x: item.transform[4] });
    }
    const pageMarkers = [...markerLines.values()].sort((left, right) => right.length - left.length)[0]?.sort((left, right) => left.round - right.round) || [];
    if (pageMarkers.length === standingRounds.length) {
      roundMarkers = pageMarkers.map((marker, index) => ({ ...marker, roundIndex: index }));
      const pointColumns = content.items.filter(item => /^(?:race|pole)$/i.test(item.str.trim()))
        .map(item => item.transform[4]).filter((x, index, all) => all.findIndex(other => Math.abs(other - x) < 2) === index).sort((left, right) => left - right);
      pointMarkers = pointColumns.length === standingRounds.length * 2
        ? pointColumns.map((x, index) => ({ round: standingRounds[Math.floor(index / 2)], roundIndex: Math.floor(index / 2), x }))
        : roundMarkers;
    }
    if (!pageMarkers.length) {
      const raceLines = new Map();
      for (const item of content.items.filter(item => /^race$/i.test(item.str.trim()) && item.transform[4] > 180)) {
        const y = Math.round(item.transform[5] * 2) / 2;
        if (!raceLines.has(y)) raceLines.set(y, []);
        raceLines.get(y).push(item.transform[4]);
      }
      const raceColumns = ([...raceLines.values()].sort((left, right) => right.length - left.length)[0] || [])
        .filter((x, index, all) => all.findIndex(other => Math.abs(other - x) < 2) === index).sort((left, right) => left - right);
      if (raceColumns.length === standingRounds.length) {
        roundMarkers = raceColumns.map((x, index) => ({ round: standingRounds[index], roundIndex: index, x }));
        const poleColumns = content.items.filter(item => /^pole$/i.test(item.str.trim()))
          .map(item => item.transform[4]).filter((x, index, all) => all.findIndex(other => Math.abs(other - x) < 2) === index).sort((left, right) => left - right);
        pointMarkers = poleColumns.length === standingRounds.length
          ? roundMarkers.flatMap((marker, index) => [marker, { round: marker.round, roundIndex: index, x: poleColumns[index] }])
          : roundMarkers;
      }
    }
    if (roundMarkers.length !== standingRounds.length) {
      const labels = content.items.map(item => item.str.trim()).filter(text => text.includes('Round'));
      throw new Error(`${championship.id}: could not locate PDF round columns (${labels.join(' | ')})`);
    }
    const lines = new Map();
    const totalHeaderX = content.items.find(item => /^total$/i.test(item.str.trim()))?.transform[4];
    const sectionHeaders = content.items.filter(item => /^FIA Endurance Trophy For /i.test(item.str.trim()))
      .map(item => ({ text: item.str.trim(), y: item.transform[5] })).sort((left, right) => right.y - left.y);
    const sectionHeader = championship.pdfSection && sectionHeaders.find(item => item.text.toLowerCase().includes(championship.pdfSection.toLowerCase()));
    const sectionFloor = sectionHeader ? (sectionHeaders.find(item => item.y < sectionHeader.y)?.y || 0) : 0;
    for (const item of content.items.filter(item => item.str.trim())) {
      const y = Math.round(item.transform[5] * 2) / 2;
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] });
    }
    for (const items of lines.values()) {
      const positionItem = items.find(item => item.x >= 58 && item.x <= 76 && /^\d+$/.test(item.text));
      if (!positionItem) continue;
      if (championship.pdfSection && (!sectionHeader || positionItem.y >= sectionHeader.y || positionItem.y <= sectionFloor)) continue;
      for (const item of content.items.filter(item => /^\d+(?:[.,]\d+)?$/.test(item.str.trim()) && Math.abs(item.transform[5] - positionItem.y) <= 1.1)) {
        if (!items.some(existing => existing.text === item.str.trim() && Math.abs(existing.x - item.transform[4]) < 0.1)) {
          items.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] });
        }
      }
      const numericItems = items.filter(item => /^\d+(?:[.,]\d+)?$/.test(item.text));
      const totalItem = Number.isFinite(totalHeaderX)
        ? numericItems.filter(item => Math.abs(item.x - totalHeaderX) < 30).sort((left, right) => Math.abs(left.x - totalHeaderX) - Math.abs(right.x - totalHeaderX))[0]
        : numericItems.filter(item => item.x >= 180 && item.x < Math.min(230, roundMarkers[0].x - 5)).sort((left, right) => right.x - left.x)[0];
      if (!totalItem) continue;
      const finalPosition = Number(positionItem.text);
      const totalPoints = Number(totalItem.text.replace(',', '.'));
      let entityId;
      if (championship.entityType === 'competitor') {
        const number = items.find(item => item.x >= 82 && item.x <= 101 && /^[A-Za-z0-9]+$/.test(item.text))?.text;
        if (!number) continue;
        entityId = competitorId(championshipClass, number, season.id);
      } else {
        const name = items.filter(item => item.x >= 74 && item.x < totalItem.x - 5
          && !/^[A-Z]{3}$/.test(item.text) && !/^\d+(?:[.,]\d+)?$/.test(item.text)).sort((a, b) => a.x - b.x)[0]?.text;
        if (!name) continue;
        entityId = championship.entityType === 'manufacturer' ? manufacturerIdFromText(name) : slug(name);
        if (championship.entityType === 'driver') entityId = ({ 'tom-dillman': 'tom-dillmann', 'david-heinemeier': 'david-heinemeier-hansson' })[entityId] || entityId;
      }
      if (!entityId) continue;
      const eventPoints = Array.from({ length: standingRounds.length }, () => 0);
      for (const item of items) {
        if (item === totalItem || item === positionItem) continue;
        const values = [...item.text.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => Number(match[0].replace(',', '.')));
        if (!values.length) continue;
        const pointMarker = pointMarkers.reduce((best, marker) => Math.abs(marker.x - item.x) < Math.abs(best.x - item.x) ? marker : best, pointMarkers[0]);
        const roundIndex = pointMarker.roundIndex;
        if (Math.abs(pointMarker.x - item.x) > 25) continue;
        eventPoints[roundIndex] += values.reduce((sum, value) => sum + value, 0);
      }
      let difference = totalPoints - eventPoints.reduce((sum, value) => sum + value, 0);
      if (Number.isInteger(difference) && difference > 0 && context.poleRounds?.has(entityId)) {
        const candidates = [...context.poleRounds.get(entityId)].filter(roundIndex => POINTS[season.events[standingRounds[roundIndex] - 1].pointsScale].includes(eventPoints[roundIndex]) || eventPoints[roundIndex] === 0);
        for (const roundIndex of candidates.slice(0, difference)) eventPoints[roundIndex] += 1;
        difference = totalPoints - eventPoints.reduce((sum, value) => sum + value, 0);
      }
      if (Math.abs(difference) > 0.01) {
        const pointItems = items.filter(item => item.x > totalItem.x + 5).map(item => `${JSON.stringify(item.text)}@${item.x.toFixed(1)}`);
        throw new Error(`${championship.id}/${entityId}: PDF event points do not match total ${totalPoints} (${eventPoints.join(', ')}; markers ${roundMarkers.map(item => item.x.toFixed(1)).join(', ')}; items ${pointItems.join(', ')})`);
      }
      entities.push({ entityId, finalPosition, eventPoints });
    }
  }
  const uniqueEntities = [...entities.reduce((byId, entity) => {
    const existing = byId.get(entity.entityId);
    if (existing && (existing.finalPosition !== entity.finalPosition || existing.eventPoints.join(',') !== entity.eventPoints.join(','))) {
      // Some official PDFs list the same driver twice because accents or spelling changed mid-season.
      // Preserve the better-ranked official row so the canonical driver ID remains unique.
      if (existing.finalPosition < entity.finalPosition) return byId;
    }
    byId.set(entity.entityId, entity);
    return byId;
  }, new Map()).values()];
  const standings = [];
  for (let roundIndex = 0; roundIndex < standingRounds.length; roundIndex += 1) {
    const round = standingRounds[roundIndex];
    const totals = uniqueEntities.map(entity => ({ ...entity, points: entity.eventPoints.slice(0, roundIndex + 1).reduce((sum, value) => sum + value, 0) }));
    for (const entity of totals) {
      const final = roundIndex === standingRounds.length - 1;
      const position = final ? entity.finalPosition : 1 + totals.filter(other => other.points > entity.points).length;
      standings.push({ championshipId: championship.id, round, position, entityId: entity.entityId, points: entity.points, championshipWon: final && entity.finalPosition === 1 });
    }
  }
  return standings;
}

async function collect() {
  const collectionSeasons = [...await discoverLegacySeasons(), ...SEASONS];
  const countries = await countryIdsByCode();
  const discoveredEntryLists = collectionSeasons.flatMap(season => season.events
    .filter(event => event.entryListUrl)
    .map(event => ({ seasonId: season.id, cacheName: `${event.id}-entry-list.pdf`, url: event.entryListUrl })));
  const entryList = await entryListMetadata(countries, discoveredEntryLists);
  const drivers = new Map();
  const teams = new Map();
  const manufacturers = new Map();
  const models = new Map();
  const competitors = new Map();
  const appearances = new Map();
  const entries = [];
  const crews = [];
  const sessions = [];
  const results = [];
  const standings = [];
  const crewsByIdentity = new Map();
  const countryByEcmId = new Map();
  const teamCountryByEcmId = new Map();

  const upsertDriver = (driverId, name, details = {}) => {
    const existing = drivers.get(driverId) || {};
    drivers.set(driverId, {
      id: driverId,
      name: existing.name || name,
      abbreviation: details.abbreviation || existing.abbreviation || name.split(/\s+/).map(part => part[0]).join('').slice(0, 3).toUpperCase(),
      nationalityCountryId: details.countryId || existing.nationalityCountryId || '',
    });
    if (details.ecmCountryId && details.countryId) countryByEcmId.set(details.ecmCountryId, details.countryId);
  };
  const addCrew = row => {
    const identity = `${row.entryId}:${row.driverId}`;
    const existing = crewsByIdentity.get(identity);
    if (existing) {
      existing.category ||= row.category;
      return existing;
    }
    crewsByIdentity.set(identity, row);
    crews.push(row);
    return row;
  };
  const enrichEntryMetadata = (row, entry) => {
    const teamEcmCountryId = String(row['ECM Country Id'] || '').trim();
    if (teamEcmCountryId) teamCountryByEcmId.set(entry.teamId, teamEcmCountryId);
    for (let index = 1; index <= 6; index += 1) {
      const rawName = [row[`DRIVER${index}_FIRSTNAME`], row[`DRIVER${index}_SECONDNAME`]].filter(Boolean).join(' ');
      const driverId = slug(rawName);
      if (!driverId) continue;
      const name = displayName(rawName);
      const details = driverDetails(row, index, countries);
      upsertDriver(driverId, name, details);
      const crew = crewsByIdentity.get(`${entry.id}:${driverId}`);
      if (crew) crew.category ||= details.category;
    }
  };

  for (const season of collectionSeasons) {
    for (const event of season.events) {
      const classificationUrl = await discoverClassificationUrl(event);
      const rows = (await parseRows(await cachedText(`${event.id}.csv`, classificationUrl)))
        .filter(row => String(row.NUMBER || '').trim());
      if (event.expectedEntries && rows.length !== event.expectedEntries) throw new Error(`${event.id}: expected ${event.expectedEntries} classification rows, found ${rows.length}`);
      const classPositions = new Map();
      const sessionId = `${event.id}-race`;
      sessions.push({ id: sessionId, eventId: event.id, seasonId: season.id, name: 'Race', type: 'race', classId: '', startTimeUtc: event.startTimeUtc, status: 'completed' });

      for (const row of rows) {
        const classCode = normalizedClassCode(row.CLASS);
        const classId = classIdFor(season.id, classCode);
        const championshipEligible = isChampionshipEligible(season, classCode);
        const classPosition = (classPositions.get(classCode) || 0) + 1;
        classPositions.set(classCode, classPosition);
        const carNumber = row.NUMBER;
        const entryId = `${event.id}-${String(carNumber).toLowerCase()}`;
        const modelId = slug(row.VEHICLE);
        const teamId = slug(row.TEAM) || `team-${modelId}-${String(carNumber).toLowerCase()}`;
        const manufacturerName = manufacturerForModel(row.VEHICLE);
        const manufacturerId = slug(manufacturerName);
        const seasonCompetitorId = competitorId(classCode, carNumber, season.id);
        teams.set(teamId, { id: teamId, name: String(row.TEAM || '').trim().replace(/^-$/, '') || `${row.VEHICLE} #${carNumber}`, countryId: '' });
        manufacturers.set(manufacturerId, { id: manufacturerId, name: manufacturerName, countryId: MANUFACTURER_COUNTRIES[manufacturerId] || '' });
        models.set(modelId, { id: modelId, manufacturerId, name: row.VEHICLE, regulation: classCode });
        competitors.set(seasonCompetitorId, { id: seasonCompetitorId, seasonId: season.id, classId, carNumber, teamId, manufacturerId, carModelId: modelId, championshipEligible });
        appearances.set(seasonCompetitorId, (appearances.get(seasonCompetitorId) || 0) + 1);
        entries.push({ id: entryId, eventId: event.id, seasonId: season.id, classId, competitorId: seasonCompetitorId, carNumber, teamId, manufacturerId, carModelId: modelId, championshipEligible });

        for (let index = 1; index <= 5; index += 1) {
          const listedName = row[`DRIVER_${index}`] || [row[`DRIVER${index}_FIRSTNAME`], row[`DRIVER${index}_SECONDNAME`]].filter(Boolean).join(' ');
          const rawName = slug(listedName) ? listedName : LEGACY_CREW_OVERRIDES[`${event.id}:${carNumber}`]?.[index - 1];
          if (!rawName) continue;
          const driverId = slug(rawName);
          if (!driverId) continue;
          const name = displayName(rawName);
          upsertDriver(driverId, name);
          addCrew({ entryId, eventId: event.id, driverId, crewOrder: index, category: '', championshipEligible });
        }

        const status = row.STATUS.toLowerCase().replace(/\s+/g, '-');
        const points = status === 'classified' && championshipEligible ? (POINTS[event.pointsScale][classPosition - 1] || 0) : 0;
        results.push({ sessionId, eventId: event.id, entryId, classId, overallPosition: Number(row.POSITION) || '', classPosition, status, laps: Number(row.LAPS) || 0, time: row.TOTAL_TIME.replace(/'/g, ':'), timeMillis: milliseconds(row.TOTAL_TIME), gap: row.GAP_FIRST, bestLap: row.FL_TIME.replace(/'/g, ':'), bestLapMillis: milliseconds(row.FL_TIME), points });
      }
      const eventEntries = new Map(entries.filter(entry => entry.eventId === event.id).map(entry => [String(entry.carNumber).toLowerCase(), entry]));
      const sessionSources = event.sessionSources || await discoverSessionSources(event);
      const expectedSupportingSessions = season.year === 2025 ? (event.id.endsWith('le-mans') ? 11 : 7)
        : season.year === 2024 ? 7 : season.year === 2023 ? (event.id.endsWith('le-mans') ? 7 : 6)
          : (event.id.endsWith('le-mans') ? 7 : 5);
      if (!event.sessionSources && sessionSources.length !== expectedSupportingSessions) throw new Error(`${event.id}: expected ${expectedSupportingSessions} supporting session sources, found ${sessionSources.length}`);
      for (const source of sessionSources) {
        const sessionRows = (await parseRows(await cachedText(`${event.id}-${slug(source.name)}.csv`, source.url)))
          .filter(row => String(row.NUMBER || '').trim());
        if (!sessionRows.length) throw new Error(`${event.id}/${source.name}: empty official classification`);
        const sourceClassPositions = new Map();
        let sourceOverallPosition = 0;
        const sourceSessionId = `${event.id}-${slug(source.name)}`;
        const matchingCodes = season.classes.map(([code]) => code).filter(code => source.name.toUpperCase().includes(code));
        const explicitCode = matchingCodes.length === 1 ? matchingCodes[0] : '';
        sessions.push({ id: sourceSessionId, eventId: event.id, seasonId: season.id, name: source.name, type: sessionType(source.name), classId: explicitCode ? classIdFor(season.id, explicitCode) : '', startTimeUtc: sessionStart(source.timestamp, event.utcOffsetHours), status: 'completed' });
        for (const row of sessionRows) {
          let classCode = normalizedClassCode(row.CLASS);
          let classId = classIdFor(season.id, classCode);
          let championshipEligible = isChampionshipEligible(season, classCode);
          let entry = eventEntries.get(String(row.NUMBER).toLowerCase());
          if (!entry) {
            if (!row.VEHICLE || !row.CLASS) continue;
            const carNumber = row.NUMBER;
            const entryId = `${event.id}-${String(carNumber).toLowerCase()}`;
            const modelId = slug(row.VEHICLE);
            const teamId = slug(row.TEAM) || `team-${modelId}-${String(carNumber).toLowerCase()}`;
            const manufacturerName = manufacturerForModel(row.VEHICLE);
            const manufacturerId = slug(manufacturerName);
            const seasonCompetitorId = competitorId(classCode, carNumber, season.id);
            teams.set(teamId, { id: teamId, name: String(row.TEAM || '').trim().replace(/^-$/, '') || `${row.VEHICLE} #${carNumber}`, countryId: '' });
            manufacturers.set(manufacturerId, { id: manufacturerId, name: manufacturerName, countryId: MANUFACTURER_COUNTRIES[manufacturerId] || '' });
            models.set(modelId, { id: modelId, manufacturerId, name: row.VEHICLE, regulation: classCode });
            competitors.set(seasonCompetitorId, { id: seasonCompetitorId, seasonId: season.id, classId, carNumber, teamId, manufacturerId, carModelId: modelId, championshipEligible });
            appearances.set(seasonCompetitorId, (appearances.get(seasonCompetitorId) || 0) + 1);
            entry = { id: entryId, eventId: event.id, seasonId: season.id, classId, competitorId: seasonCompetitorId, carNumber, teamId, manufacturerId, carModelId: modelId, championshipEligible };
            entries.push(entry);
            eventEntries.set(String(carNumber).toLowerCase(), entry);
            for (let index = 1; index <= 6; index += 1) {
              const rawName = [row[`DRIVER${index}_FIRSTNAME`], row[`DRIVER${index}_SECONDNAME`]].filter(Boolean).join(' ');
              if (!rawName) continue;
              const driverId = slug(rawName);
              if (!driverId) continue;
              const name = displayName(rawName);
              upsertDriver(driverId, name);
              addCrew({ entryId, eventId: event.id, driverId, crewOrder: index, category: '', championshipEligible });
            }
          }
          classId = entry.classId;
          classCode = classId.slice(season.id.length + 1);
          championshipEligible = entry.championshipEligible;
          const sessionDriverName = String(row.DRIVER || '').trim();
          const sessionDriverId = slug(sessionDriverName);
          if (sessionDriverId && !crews.some(crew => crew.entryId === entry.id && crew.driverId === sessionDriverId)) {
            const name = displayName(sessionDriverName);
            upsertDriver(sessionDriverId, name);
            const crewOrder = crews.filter(crew => crew.entryId === entry.id).length + 1;
            addCrew({ entryId: entry.id, eventId: event.id, driverId: sessionDriverId, crewOrder, category: '', championshipEligible });
          }
          enrichEntryMetadata(row, entry);
          const classPosition = (sourceClassPositions.get(classId) || 0) + 1;
          sourceClassPositions.set(classId, classPosition);
          const position = Number(row.POS) ? ++sourceOverallPosition : '';
          const lapTime = String(row.TIME || '').replace(/'/g, ':').replace(/^-$/, '');
          results.push({ sessionId: sourceSessionId, eventId: event.id, entryId: entry.id, classId, overallPosition: position, classPosition: position ? classPosition : '', status: position ? 'classified' : 'not-classified', laps: Number(row.LAPS || row[' LAPS']) || 0, time: '', timeMillis: '', gap: String(row.GAP_FIRST || '').replace(/^-$/, ''), bestLap: lapTime, bestLapMillis: milliseconds(lapTime), points: 0 });
        }
      }
      console.log(`${event.id}: ${rows.length} race entries and ${sessionSources.length} supporting sessions`);
    }
    if (season.standings === 'html') {
      standings.push(...parseStandings(await cachedText(`season-${season.year}.html`, season.sourceUrl), season));
    } else if (season.standings === 'pdf') {
      for (const championship of season.championships) {
        const poleRounds = poleRoundsForChampionship(championship, season, sessions, results, entries, crews);
        standings.push(...await parsePdfStandings(championship, season, { poleRounds }));
      }
    }
  }

  for (const team of teams.values()) {
    const ecmCountryId = teamCountryByEcmId.get(team.id);
    team.countryId ||= countryByEcmId.get(ecmCountryId) || entryList.teams.get(team.id) || TEAM_COUNTRY_FALLBACKS[team.id] || '';
  }
  for (const [identity, details] of entryList.drivers) {
    const driverId = identity.slice(identity.indexOf(':') + 1);
    const driver = drivers.get(driverId);
    if (driver) driver.nationalityCountryId ||= details.countryId;
  }
  for (const driver of drivers.values()) driver.nationalityCountryId ||= DRIVER_COUNTRY_FALLBACKS[driver.id] || '';
  const categoriesBySeasonDriver = new Map();
  const entryById = new Map(entries.map(entry => [entry.id, entry]));
  for (const crew of crews) {
    const entry = entryById.get(crew.entryId);
    if (!entry || !crew.category) continue;
    const identity = `${entry.seasonId}:${crew.driverId}`;
    if (!categoriesBySeasonDriver.has(identity)) categoriesBySeasonDriver.set(identity, new Set());
    categoriesBySeasonDriver.get(identity).add(crew.category);
  }
  for (const [identity, details] of entryList.drivers) {
    if (!details.category) continue;
    if (!categoriesBySeasonDriver.has(identity)) categoriesBySeasonDriver.set(identity, new Set());
    categoriesBySeasonDriver.get(identity).add(details.category);
  }
  const categorizedIdentitiesBySeason = new Map();
  for (const [identity, categories] of categoriesBySeasonDriver) {
    if (categories.size !== 1) continue;
    const separator = identity.indexOf(':');
    const seasonId = identity.slice(0, separator);
    if (!categorizedIdentitiesBySeason.has(seasonId)) categorizedIdentitiesBySeason.set(seasonId, []);
    categorizedIdentitiesBySeason.get(seasonId).push({
      compactId: identity.slice(separator + 1).replace(/-/g, ''), category: [...categories][0],
    });
  }
  for (const crew of crews) {
    if (crew.category) continue;
    const entry = entryById.get(crew.entryId);
    let categories = categoriesBySeasonDriver.get(`${entry.seasonId}:${crew.driverId}`);
    if (!categories) {
      const compactId = crew.driverId.replace(/-/g, '');
      const candidates = categorizedIdentitiesBySeason.get(entry.seasonId) || [];
      const exact = candidates.filter(candidate => candidate.compactId === compactId);
      if (exact.length && new Set(exact.map(candidate => candidate.category)).size === 1) {
        categories = new Set([exact[0].category]);
      } else {
        const ranked = candidates.map(candidate => ({ ...candidate, distance: editDistance(compactId, candidate.compactId) }))
          .sort((left, right) => left.distance - right.distance);
        const closest = ranked.filter(candidate => candidate.distance === ranked[0]?.distance);
        if (ranked[0]?.distance <= 2 && new Set(closest.map(candidate => candidate.category)).size === 1) {
          categories = new Set([closest[0].category]);
        }
      }
    }
    if (categories?.size === 1) crew.category = [...categories][0];
    crew.category ||= DRIVER_CATEGORY_FALLBACKS[`${crew.eventId}:${crew.driverId}`]
      || DRIVER_CATEGORY_FALLBACKS[`${entry.seasonId}:${crew.driverId}`] || '';
  }

  for (const competitor of competitors.values()) competitor.championshipEligible = Boolean(competitor.championshipEligible && appearances.get(competitor.id) > 1);
  const knownEntities = new Set([...drivers.keys(), ...teams.keys(), ...manufacturers.keys(), ...competitors.keys()]);
  const unknown = standings.filter(row => !knownEntities.has(row.entityId));
  if (unknown.length) throw new Error(`Unknown standings entities: ${[...new Set(unknown.map(row => `${row.championshipId}/${row.entityId}`))].join(', ')}`);

  const seasonRows = collectionSeasons.map(season => ({ id: season.id, year: season.year, name: `${season.label || season.year} FIA World Endurance Championship`, startDate: season.events[0].startTimeUtc.slice(0, 10), endDate: season.events.at(-1).startTimeUtc.slice(0, 10), status: 'completed', sourceUrl: season.sourceUrl }));
  const classRows = collectionSeasons.flatMap(season => season.classes.map(([code, name], index) => ({
    id: classIdFor(season.id, code), seasonId: season.id, year: season.year, code, name, displayOrder: index + 1,
    sourceUrl: code === 'INNOVATIVE CAR' ? season.events.find(event => event.id.endsWith('le-mans')).sourceUrl : season.sourceUrl,
  })));
  const circuitRows = CIRCUITS.map(circuit => ({ ...circuit, sourceUrl: SEASONS.at(-1).sourceUrl }));
  const eventRows = collectionSeasons.flatMap(season => season.events.map((event, index) => {
    const detail = EVENT_DETAILS.find(([key]) => event.id.endsWith(key));
    return { id: event.id, seasonId: season.id, year: season.year, round: index + 1, date: event.startTimeUtc.slice(0, 10), endDate: event.id.includes('le-mans') ? new Date(new Date(event.startTimeUtc).getTime() + 86400000).toISOString().slice(0, 10) : event.startTimeUtc.slice(0, 10), name: event.eventName || detail[1], circuitId: event.circuitId || detail[2], formatType: event.formatType || detail[3], scheduledMinutes: event.scheduledMinutes ?? detail[4], scheduledDistanceKm: event.scheduledDistanceKm ?? detail[5], pointsScale: event.pointsScale, status: 'completed', sourceUrl: season.sourceUrl };
  }));
  writeCsv('wecdb-seasons.csv', ['id', 'year', 'name', 'startDate', 'endDate', 'status', 'sourceUrl'], seasonRows);
  writeCsv('wecdb-classes.csv', ['id', 'seasonId', 'year', 'code', 'name', 'displayOrder', 'sourceUrl'], classRows);
  writeCsv('wecdb-circuits.csv', ['id', 'name', 'countryId', 'placeName', 'type', 'direction', 'latitude', 'longitude', 'length', 'turns', 'layoutId', 'layoutVersion', 'mapSourceUrl', 'sourceUrl'], circuitRows);
  writeCsv('wecdb-events.csv', ['id', 'seasonId', 'year', 'round', 'date', 'endDate', 'name', 'circuitId', 'formatType', 'scheduledMinutes', 'scheduledDistanceKm', 'pointsScale', 'status', 'sourceUrl'], eventRows);
  writeCsv('wecdb-drivers.csv', ['id', 'name', 'abbreviation', 'nationalityCountryId'], [...drivers.values()]);
  writeCsv('wecdb-teams.csv', ['id', 'name', 'countryId'], [...teams.values()]);
  writeCsv('wecdb-manufacturers.csv', ['id', 'name', 'countryId'], [...manufacturers.values()]);
  writeCsv('wecdb-car-models.csv', ['id', 'manufacturerId', 'name', 'regulation'], [...models.values()]);
  writeCsv('wecdb-competitors.csv', ['id', 'seasonId', 'classId', 'carNumber', 'teamId', 'manufacturerId', 'carModelId', 'championshipEligible'], [...competitors.values()]);
  writeCsv('wecdb-entries.csv', ['id', 'eventId', 'seasonId', 'classId', 'competitorId', 'carNumber', 'teamId', 'manufacturerId', 'carModelId', 'championshipEligible'], entries);
  writeCsv('wecdb-entry-drivers.csv', ['entryId', 'eventId', 'driverId', 'crewOrder', 'category', 'championshipEligible'], crews);
  writeCsv('wecdb-sessions.csv', ['id', 'eventId', 'seasonId', 'name', 'type', 'classId', 'startTimeUtc', 'status'], sessions);
  writeCsv('wecdb-session-results.csv', ['sessionId', 'eventId', 'entryId', 'classId', 'overallPosition', 'classPosition', 'status', 'laps', 'time', 'timeMillis', 'gap', 'bestLap', 'bestLapMillis', 'points'], results);
  writeCsv('wecdb-championships.csv', ['id', 'seasonId', 'name', 'entityType', 'classId', 'classIds', 'sourceUrl'], collectionSeasons.flatMap(season => season.championships.map(row => ({
    ...row, seasonId: season.id, classIds: championshipClassIds(row, season).join('|'), sourceUrl: row.pdfUrl || season.sourceUrl
  }))));
  writeCsv('wecdb-standings.csv', ['championshipId', 'round', 'position', 'entityId', 'points', 'championshipWon'], standings);
  console.log(`Wrote ${entries.length} entries, ${crews.length} crew assignments, ${sessions.length} sessions, ${results.length} results, ${competitors.size} competitors and ${standings.length} standings rows.`);
}

if (require.main === module) collect().catch(error => { console.error(error); process.exitCode = 1; });

module.exports = { CHAMPIONSHIPS, EVENTS, MANUFACTURER_BY_MODEL, SEASONS, championshipClassIds, championshipPdfMatches, competitorId, milliseconds, parseRows, parseStandings, parsePdfStandings, slug, tableRows };
