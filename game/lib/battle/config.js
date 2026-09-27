/* Правила карт: численность, респауны, дальность видимости. */
export const MAP_RULES = {
  forest: {
    title: 'ТИХИЙ БОР · Forest Camp',
    botsPerGeneral: 20, botRespawns: 3, generalRespawns: 4,
    visRange: 110, hearRange: 160, navCell: 2, respawnDelay: 10, flagHold: 12
  },
  hangar: {
    title: 'АНГАР-07',
    botsPerGeneral: 10, botRespawns: 2, generalRespawns: 3,
    visRange: 75, hearRange: 90, navCell: 0.5, respawnDelay: 8, flagHold: 10
  }
};

/* Оружие ботов (баллистика — из оружейной): свои несут АК/СВД, противник — M416/SCAR-H. */
export const BOT_GUNS = {
  ak74: { rpm: 650, mag: 30, v: 900, auto: true, spreadMoa: 2.4, cal: 'r545' },
  akm: { rpm: 600, mag: 30, v: 715, auto: true, spreadMoa: 3.2, cal: 'r762' },
  svd: { rpm: 120, mag: 10, v: 830, auto: false, spreadMoa: 1.2, cal: 'r762r', sniper: true },
  m416: { rpm: 850, mag: 30, v: 880, auto: true, spreadMoa: 1.4, cal: 'r556' },
  scar: { rpm: 600, mag: 20, v: 790, auto: true, spreadMoa: 1.1, cal: 'r762n' },
  glock18c: { rpm: 1200, mag: 17, v: 360, auto: true, spreadMoa: 4.5, cal: 'p9' },
  mp5a3: { rpm: 800, mag: 30, v: 400, auto: true, spreadMoa: 3.2, cal: 'p9' },
  m870: { rpm: 60, mag: 4, v: 400, auto: false, spreadMoa: 4, cal: 'g12', pellets: 9 }
};
export const ALLY_GUNS = ['ak74', 'ak74', 'akm', 'akm', 'ak74', 'svd'];
export const ENEMY_GUNS = ['m416', 'm416', 'scar', 'm416', 'scar', 'scar'];
export const BOT_RESERVE_MAGS = 5;
export const BOT_GRENADES = { m67: 1, m84: 0 };
export const GENERAL_GRENADES = { m67: 2, m84: 1 };
