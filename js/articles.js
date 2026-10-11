/* articles.js —— 内置练习文章（均为公版经典文本）
   数据结构：
     { id, title, author, source, builtin:true, text }
   text 用 \n 分行；引擎会再按容器宽度自动折行。 */
window.BUILTIN_ARTICLES = [
  {
    id: 'jingyesi',
    title: '静夜思',
    author: '李白',
    source: '唐诗·五言绝句',
    builtin: true,
    text: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。'
  },
  {
    id: 'chunxiao',
    title: '春晓',
    author: '孟浩然',
    source: '唐诗·五言绝句',
    builtin: true,
    text: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。'
  },
  {
    id: 'guanquelou',
    title: '登鹳雀楼',
    author: '王之涣',
    source: '唐诗·五言绝句',
    builtin: true,
    text: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。'
  },
  {
    id: 'minnong',
    title: '悯农',
    author: '李绅',
    source: '唐诗·五言绝句',
    builtin: true,
    text: '锄禾日当午，汗滴禾下土。\n谁知盘中餐，粒粒皆辛苦。'
  },
  {
    id: 'chunwang',
    title: '春望',
    author: '杜甫',
    source: '唐诗·五言律诗',
    builtin: true,
    text: '国破山河在，城春草木深。\n感时花溅泪，恨别鸟惊心。\n烽火连三月，家书抵万金。\n白头搔更短，浑欲不胜簪。'
  },
  {
    id: 'chun-zhuziqing',
    title: '春（节选）',
    author: '朱自清',
    source: '现代散文',
    builtin: true,
    text: '盼望着，盼望着，东风来了，春天的脚步近了。\n一切都像刚睡醒的样子，欣欣然张开了眼。山朗润起来了，水涨起来了，太阳的脸红起来了。\n小草偷偷地从土里钻出来，嫩嫩的，绿绿的。园子里，田野里，瞧去，一大片一大片满是的。'
  },
  {
    id: 'congcong',
    title: '匆匆（节选）',
    author: '朱自清',
    source: '现代散文',
    builtin: true,
    text: '燕子去了，有再来的时候；杨柳枯了，有再青的时候；桃花谢了，有再开的时候。\n但是，聪明的，你告诉我，我们的日子为什么一去不复返呢？\n是有人偷了他们罢：那是谁？又藏在何处呢？是他们自己逃走了罢：现在又到了哪里呢？'
  },
  {
    id: 'loushiming',
    title: '陋室铭',
    author: '刘禹锡',
    source: '唐·骈体铭文',
    builtin: true,
    text: '山不在高，有仙则名。水不在深，有龙则灵。\n斯是陋室，惟吾德馨。苔痕上阶绿，草色入帘青。\n谈笑有鸿儒，往来无白丁。可以调素琴，阅金经。\n无丝竹之乱耳，无案牍之劳形。\n南阳诸葛庐，西蜀子云亭。孔子云：何陋之有？'
  },
  {
    id: 'aitilian',
    title: '爱莲说（节选）',
    author: '周敦颐',
    source: '宋·散文',
    builtin: true,
    text: '水陆草木之花，可爱者甚蕃。\n予独爱莲之出淤泥而不染，濯清涟而不妖，中通外直，不蔓不枝，香远益清，亭亭净植，可远观而不可亵玩焉。'
  },
  {
    id: 'baicaoyuan',
    title: '从百草园到三味书屋（节选）',
    author: '鲁迅',
    source: '现代散文',
    builtin: true,
    text: '不必说碧绿的菜畦，光滑的石井栏，高大的皂荚树，紫红的桑椹；\n也不必说鸣蝉在树叶里长吟，肥胖的黄蜂伏在菜花上，轻捷的叫天子忽然从草间直窜向云霄里去了。'
  }
];
