/* ===== 数据：棋盘 / 卡片 / 棋子 ===== */

// 格子类型：go 起点 | prop 地产 | chance 机会 | fate 命运 | tax 税收 | station 车站
//           jailVisit 探监 | jailGo 进监狱 | rest 监狱停留中 | free 免费停车(奖金池)
const BOARD = [
  { t:'go',      name:'起点',   en:'GO',          desc:'经过或停留 +¥2,000' },
  { t:'prop',    name:'南郊',   group:'棕',  price:600,  color:'#955436' },
  { t:'chance',  name:'机会',   en:'CHANCE' },
  { t:'prop',    name:'葡萄藤', group:'棕',  price:1000, color:'#955436' },
  { t:'tax',     name:'所得税', taxType:'income' },
  { t:'station', name:'第一车站', price:2000 },
  { t:'prop',    name:'波罗的', group:'蓝',  price:1400, color:'#aae0fa' },
  { t:'fate',    name:'命运',   en:'FATE' },
  { t:'prop',    name:'东方区', group:'蓝',  price:1800, color:'#aae0fa' },
  { t:'rest',    name:'监狱 · 探监', en:'JAIL',   desc:'只是路过，自由身' },
  { t:'prop',    name:'佛蒙特', group:'粉',  price:2200, color:'#d93a96' },
  { t:'prop',    name:'康涅狄格', group:'粉', price:2600, color:'#d93a96' },
  { t:'prop',    name:'圣查尔斯', group:'粉', price:3000, color:'#d93a96' },
  { t:'station', name:'第二车站', price:2000 },
  { t:'prop',    name:'州际大道', group:'橙',  price:3400, color:'#f79428' },
  { t:'prop',    name:'弗吉尼亚', group:'橙',  price:3800, color:'#f79428' },
  { t:'chance',  name:'机会',   en:'CHANCE' },
  { t:'prop',    name:'圣詹姆斯', group:'橙',  price:4200, color:'#f79428' },
  { t:'free',    name:'免费停车', en:'FREE PARK', desc:'可拿走累积奖金池' },
  { t:'prop',    name:'田纳西', group:'红',  price:4600, color:'#ed1b24' },
  { t:'fate',    name:'命运',   en:'FATE' },
  { t:'prop',    name:'纽约大道', group:'红',  price:5000, color:'#ed1b24' },
  { t:'chance',  name:'机会',   en:'CHANCE' },
  { t:'prop',    name:'肯塔基', group:'红',  price:5400, color:'#ed1b24' },
  { t:'station', name:'第三车站', price:2000 },
  { t:'prop',    name:'伊利诺伊', group:'黄',  price:6000, color:'#fef200' },
  { t:'prop',    name:'印第安纳', group:'黄',  price:6600, color:'#fef200' },
  { t:'tax',     name:'奢侈税', taxType:'luxury' },
  { t:'prop',    name:'大西洋', group:'黄',  price:7200, color:'#fef200' },
  { t:'jailGo',  name:'进监狱', en:'GO TO JAIL', desc:'立即入狱' },
  { t:'prop',    name:'太平洋', group:'绿',  price:8000, color:'#1fb25a' },
  { t:'prop',    name:'五月花', group:'绿',  price:8800, color:'#1fb25a' }
];

// 修正手误后的地图数据无需运行时补丁（下方保留健壮性检查）

// 房间租金倍率与造价
const HOUSES = { costFactor: 0.5, max: 3, mult: [1, 2, 3.5, 5] }; // 有全色组时倍率翻倍

// 棋子预设（8 名玩家）
const TOKENS = [
  { emoji:'🐷', name:'小猪', color:'#ff8fa3' },
  { emoji:'🎩', name:'礼帽', color:'#2f3542' },
  { emoji:'🚗', name:'汽车', color:'#e84118' },
  { emoji:'🐕', name:'小狗', color:'#d6a419' },
  { emoji:'⚓', name:'铁锚', color:'#2f6fed' },
  { emoji:'🚢', name:'轮船', color:'#1fb25a' },
  { emoji:'👞', name:'皮靴', color:'#8a5cf6' },
  { emoji:'🧵', name:'线团', color:'#e170fc' }
];

const START_CASH = 20000;
const GO_SALARY  = 2000;
const JAIL_FINE  = 500;
const STATION_RENT = [300, 600, 1200, 2400];

/* ----- 机会卡 ----- */
const CHANCE_CARDS = [
  { text:'股市大涨！你的投资组合增值，获得 ¥2,000',      cash: 2000 },
  { text:'银行失误，多付了利息，获得 ¥800',              cash: 800 },
  { text:'健身房年卡到期，但你没去，退款 ¥300',          cash: 300 },
  { text:'违章停车罚款 ¥500',                            cash: -500 },
  { text:'误诊住院，医疗费 ¥1,200',                       cash: -1200 },
  { text:'税务局退税，获得 ¥1,000',                       cash: 1000 },
  { text:'前进到「起点」，领取工资',                      moveTo: 0, goSalary: true },
  { text:'一路高歌，前进 3 格',                           moveSteps: 3 },
  { text:'迷路了，后退 3 格',                             moveSteps: -3 },
  { text:'违规燃放烟花，直接被送进监狱',                   gotoJail: true },
  { text:'热心赞助社区建设，每位玩家给你 ¥100',            collectFromAll: 100 },
  { text:'中了一笔彩票！获得 ¥3,000',                     cash: 3000 }
];

/* ----- 命运卡 ----- */
const FATE_CARDS = [
  { text:'网购剁手，花费 ¥600',                           cash: -600 },
  { text:'收到年终红包，获得 ¥1,500',                     cash: 1500 },
  { text:'终于把旧书卖出去了，获得 ¥250',                 cash: 250 },
  { text:'二手车剐蹭，修车 ¥900',                         cash: -900 },
  { text:'房东涨租，补缴押金 ¥1,000',                     cash: -1000 },
  { text:'继承远房亲戚的一笔遗产，获得 ¥2,500',           cash: 2500 },
  { text:'去监狱探监朋友，直接进监狱',                     gotoJail: true },
  { text:'坐高铁去起点度假，领取工资',                     moveTo: 0, goSalary: true },
  { text:'走错方向，后退 4 格',                            moveSteps: -4 },
  { text:'人生赢家，直接前进到「免费停车」',                moveTo: 19 },
  { text:'请在场所有玩家喝一杯，每人收你 ¥150 → 奖金池',   payAll: 150 },
  { text:'替邻居代收了快递费，获得 ¥400',                  cash: 400 }
];

// 棋盘尺寸
const GRID = 9;              // 9x9
const CELL = 150;            // 每格像素
const BOARD_PX = GRID * CELL;
