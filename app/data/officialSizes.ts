/**
 * Official "Size" dropdown options for this app's catalogue, harvested from the
 * store API's product-detail `variants` (the site's "### Size" list, which only
 * carries prices when the locale/country headers are sent). The harvest output
 * this map was generated from is kept in `harvest/sizes-priced.json`.
 *
 * The website keeps a product's sizes inside that product's own Size selector
 * instead of as separate catalogue entries — a mattress is stored once, at a
 * default size, with a "### Size" list of up to seven options. This map mirrors
 * those lists, with the per-size price the site charges, so one product page can
 * offer every size without depending on a live fetch from the browser.
 *
 * Tuple = [label, price?, listPrice?]; prices are AED as served for `ae`.
 */
export type OfficialSize = {
  /** Exactly as the site labels it, e.g. "Queen - 200x160 cm". */
  label: string;
  price?: number;
  listPrice?: number;
};

type RawSize = readonly [label: string, price?: number, listPrice?: number];

/** Product slug -> official size options, in the site's own order. */
const RAW_SIZES: Record<string, readonly RawSize[]> = {
  'adara-storage-bed': [['200x160 - Queen', 3073, 4390], ['200x120 - Single', 2303, 3290], ['200x180 - King', 3297, 4710], ['200x200 - Super King', 3661, 5230], ['200x150 - Double', 2919, 4170]],
  'adya-bed': [['King - 200x180 cm', 1274, 1955], ['Queen - 200x160 cm', 1190, 1826], ['Super King Size - 200x200 cm', 1414, 2170], ['Queen - 200x150 cm', 1148, 1760], ['Single Size - 190x90 cm', 735, 1125], ['Single Size - 200x120 cm', 987, 1510], ['Double - 200x140 cm', 1106, 1680]],
  'alex-single-seater-sofa': [['1 Seater', 1127, 1610], ['2 Seater', 1127, 1610], ['3 Seater', 1127, 1610]],
  'anti-virus-mattress-topper': [['190x90 - Single size', 378, 540], ['200×120 - Single Size', 525, 750], ['200x180 - king size', 791, 1130], ['200x160 - queen size', 707, 1010], ['200x150 - queen size', 658, 940]],
  'anvi-bed': [['King - 200x180 cm', 1435, 2185], ['Queen - 200x160 cm', 1344, 2045], ['Super King Size - 200x200 cm', 1554, 2370], ['Queen - 200x150 cm', 1309, 1990], ['Single Size - 190x90 cm', 819, 1240], ['Single Size - 200x120 cm', 1092, 1660], ['Double - 200x140 cm', 1274, 1935]],
  'asara-bed-bench': [['160 cm', 553, 790], ['170 cm', 595, 850]],
  'ash-pocket-spring-mattress': [['Queen - 200x150 cm', 1248, 2080], ['Super King Size - 200x200 cm', 1662, 2770], ['King - 200x180 cm', 1500, 2500], ['Single Size - 190x90 cm', 714, 1190], ['Single Size - 200x120 cm', 1002, 1670], ['Queen - 200x160 cm', 1332, 2220]],
  'aster-pillow-top-mattress': [['Queen - 200x160 cm', 805, 1320], ['Single Size - 200x120 cm', 604, 990], ['Single Size - 190x90 cm', 433, 710], ['King - 200x180 cm', 909, 1490], ['Super King Size - 200x200 cm', 1007, 1650], ['Queen - 200x150 cm', 756, 1240]],
  'atom-bed': [['King - 200x180 cm', 2195, 3316], ['Queen - 200x160 cm', 1995, 3020], ['Super King Size - 200x200 cm', 2295, 3479], ['Single Size - 200x90 cm', 1330, 2000], ['Queen - 200x150 cm', 1960, 2960], ['Single Size - 200x120 cm', 1695, 2556], ['Double - 200x140 cm', 1918, 2890]],
  'atom-hydraulic-bed': [['200x120 - Single', 1995, 2850], ['200x90 - Single', 1267, 1810]],
  'aura-box-top-medical-foam-mattress': [['Queen - 200x160 cm', 1212, 1732], ['Single Size - 200x120 cm', 909, 1299], ['Single Size - 190x90 cm', 658, 940], ['King - 200x180 cm', 1368, 1954], ['Super King Size - 200x200 cm', 1519, 2170], ['Queen - 200x150 cm', 1138, 1626]],
  'aura-medical-foam-mattress': [['Queen - 200x160 cm', 679, 970], ['Single Size - 200x120 cm', 511, 730], ['Single Size - 190x90 cm', 364, 520], ['King - 200x180 cm', 765, 1093], ['Super King Size - 200x200 cm', 847, 1210], ['Queen - 200x150 cm', 638, 912]],
  'ava-kids-pocket-spring-mattress': [['Single Size - 190x90 cm', 595, 850], ['Single Size - 190x120 cm', 763, 1090], ['Single Size - 200x120 cm', 805, 1150]],
  'azilea-smart-pro-grid-mattress-56bb1d': [['Queen - 200x160 cm', 2888, 4125], ['Single Size - 200x120 cm', 1491, 2130], ['King - 200x180 cm', 3057, 4367], ['Super King Size - 200x200 cm', 3231, 4615]],
  'balance-bed': [['King - 200x180 cm', 2097, 3220], ['Queen - 200x160 cm', 1995, 3050], ['Super King Size - 200x200 cm', 2261, 3480], ['Single Size - 200x90 cm', 1631, 2450], ['Queen - 200x150 cm', 1946, 2970], ['Single Size - 200x120 cm', 1820, 2750]],
  'basic-mattress-topper': [['190x90 - Single size', 231, 330], ['200×120 - Single Size', 322, 460], ['200x180 - king size', 476, 680], ['200x160 - queen size', 420, 600], ['200x150 - queen size', 399, 570]],
  'belle-pocket-spring-mattress': [['Queen - 200x160 cm', 945, 1350], ['Single Size - 200x120 cm', 707, 1010], ['Single Size - 200x90 cm', 529, 755], ['Single Size - 190x90 cm', 504, 720], ['King - 200x180 cm', 1061, 1515], ['Super King Size - 200x200 cm', 1176, 1680], ['Queen - 200x150 cm', 882, 1260]],
  'biaritz-bed': [['King - 200x180 cm', 1757, 2710], ['Queen - 200x160 cm', 1554, 2390], ['Super King Size - 200x200 cm', 1939, 3000], ['Single Size - 200x90 cm', 952, 1460], ['Queen - 200x150 cm', 1526, 2340], ['Single Size - 190x90 cm', 889, 1370]],
  'blake-bed': [['King - 200x180 cm', 2457, 3730], ['Queen - 200x160 cm', 2338, 3540]],
  'blaze-bonnell-spring-mattress': [['Queen - 200x160 cm', 1068, 1810], ['Single Size - 200x120 cm', 802, 1360], ['Single Size - 200x90 cm', 602, 1020], ['Single Size - 190x90 cm', 572, 970], ['King - 200x180 cm', 1198, 2030], ['Super King Size - 200x200 cm', 1333, 2260], ['Queen - 200x150 cm', 1003, 1700]],
  'blossom-memory-foam-bonnell-spring-mattress': [['Queen - 200x150 cm', 1820, 2600], ['Super King Size - 200x200 cm', 2429, 3470], ['King - 200x180 cm', 2184, 3120], ['Single Size - 190x90 cm', 1043, 1490], ['Single Size - 200x90 cm', 1092, 1560], ['Single Size - 200x120 cm', 1456, 2080], ['Queen - 200x160 cm', 1939, 2770]],
  'bowery-round-foam-mattress': [['250x250', 2156, 3080], ['230x230', 1995, 2850], ['220x220', 1421, 2030]],
  'cadera-bed': [['Queen - 200x160 cm', 2177, 3323], ['Super King Size - 200x200 cm', 2597, 3977], ['Queen - 200x150 cm', 2044, 3120], ['Single Size - 200x120 cm', 1631, 2490], ['Double - 200x140 cm', 2016, 3067]],
  'cairns-bed': [['King - 200x180 cm', 3501, 5275], ['Queen - 200x160 cm', 3346, 5030], ['Super King Size - 200x200 cm', 3781, 5690], ['Queen - 200x150 cm', 3245, 4885], ['Single Size - 200x120 cm', 3045, 4540]],
  'calista-box-top-pocket-spring-mattress': [['Queen - 200x160 cm', 1742, 2680], ['Single Size - 200x120 cm', 1307, 2010], ['Single Size - 200x90 cm', 1008, 1550], ['Single Size - 190x90 cm', 936, 1440], ['King - 200x180 cm', 1963, 3020], ['Super King Size - 200x200 cm', 2178, 3350], ['Queen - 200x150 cm', 1638, 2520]],
  'camila-hydraulic-bed': [['200x160 - Queen', 2205, 3150], ['200x120 - Single', 1890, 2700], ['200x180 - King', 2338, 3340], ['200x200 - Super King', 2541, 3630]],
  'castle-bed': [['Super King Size - 200x200 cm', 2135, 3250], ['Single Size - 200x90 cm', 1197, 1810], ['Queen - 200x150 cm', 1806, 2745], ['Single Size - 200x120 cm', 1610, 2430]],
  'cf-3402-bed': [['King - 200x180 cm', 2394, 3612], ['Queen - 200x160 cm', 2135, 3221], ['Super King Size - 200x200 cm', 2667, 4024], ['Queen - 200x150 cm', 2002, 3020], ['Single Size - 200x120 cm', 1680, 2540], ['Double - 200x140 cm', 1988, 3000]],
  'como-bed-walnut': [['King - 200x180 cm', 1071, 1530], ['Queen - 200x160 cm', 903, 1290]],
  'conduction-mattress-topper': [['190x90 - Single size', 266, 380], ['200×120 - Single Size', 364, 520], ['200x180 - king size', 546, 780], ['200x160 - queen size', 490, 700], ['200x150 - queen size', 455, 650]],
  'cool-fabric-memory-foam-mattress-topper': [['200×120 - Single Size', 602, 860], ['200x180 - king size', 889, 1270], ['200x160 - queen size', 791, 1130], ['200x150 - queen size', 742, 1060], ['200x200 - Super king size', 998, 1425]],
  'cozycore-memory-foam-mattress': [['Queen - 200x160 cm', 1352, 2080], ['Single Size - 200x120 cm', 1014, 1560], ['Single Size - 200x90 cm', 760, 1169], ['Single Size - 190x90 cm', 722, 1110], ['King - 200x180 cm', 1521, 2340], ['Super King Size - 200x200 cm', 1687, 2595], ['Queen - 200x150 cm', 1268, 1950]],
  'cresent-bed': [['King - 200x180 cm', 2401, 3580], ['Queen - 200x160 cm', 2247, 3345], ['Queen - 200x150 cm', 2184, 3250], ['Single Size - 200x120 cm', 1918, 2850]],
  'crown-bed': [['King - 200x180 cm', 2807, 4260], ['Queen - 200x150 cm', 2450, 3708]],
  'dianora-bed-bench-524578': [['160 cm', 1134, 1620], ['180 cm', 1211, 1730], ['200 cm', 1337, 1910], ['130 cm', 994, 1420]],
  'dilse-bed': [['King - 200x180 cm', 2093, 3130], ['Queen - 200x160 cm', 1988, 2975], ['Super King Size - 200x200 cm', 2261, 3385], ['Single Size - 200x120 cm', 1680, 2505]],
  'dream-shadow-bed': [['Double Size - 190x150 cm', 1337, 2030], ['King - 200x180 cm', 1603, 2430], ['Queen - 200x160 cm', 1421, 2160], ['Super King Size - 200x200 cm', 1771, 2690], ['Single Size - 200x120 cm', 1057, 1610], ['Double - 200x140 cm', 1246, 1890]],
  'duke-accent-chair': [['1 Seater', 987, 1410], ['2 Seater', 987, 1410], ['3 Seater', 987, 1410]],
  'duke-accent-chair-0a90f2': [['1 Seater', 987, 1410], ['2 Seater', 987, 1410], ['3 Seater', 987, 1410]],
  'duke-accent-chair-23459d': [['1 Seater', 987, 1410], ['2 Seater', 987, 1410], ['3 Seater', 987, 1410]],
  'duke-accent-chair-d767fb': [['1 Seater', 987, 1410], ['2 Seater', 987, 1410], ['3 Seater', 987, 1410]],
  'ease-foam-mattress': [['Single Size - 200x100 cm', 397, 610], ['Single Size - 190x120 cm', 468, 720], ['Queen - 200x160 cm', 631, 970], ['Single Size - 200x120 cm', 475, 730], ['Single Size - 200x90 cm', 354, 545], ['Single Size - 190x90 cm', 335, 515], ['King - 200x180 cm', 709, 1090], ['Super King Size - 200x200 cm', 787, 1210], ['Queen - 200x150 cm', 592, 910]],
  'econo-foam-mattress': [['Queen - 200x160 cm', 1235, 1900], ['Single Size - 200x120 cm', 930, 1430], ['Single Size - 200x90 cm', 694, 1068], ['Single Size - 190x90 cm', 663, 1020], ['King - 200x180 cm', 1391, 2140], ['Super King Size - 200x200 cm', 1547, 2380], ['Queen - 200x150 cm', 1157, 1780]],
  'egan-7-zone-pocket-spring-mattress': [['Queen - 200x160 cm', 1435, 2050], ['Single Size - 200x120 cm', 1071, 1530], ['King - 200x180 cm', 1607, 2295], ['Super King Size - 200x200 cm', 1785, 2550], ['Queen - 200x150 cm', 1339, 1913]],
  'elsa-hydraulic-bed': [['200x160 - Queen', 2450, 3500], ['200x180 - King', 2618, 3740], ['200x200 - Super King', 2828, 4040]],
  'ember-medical-foam-mattress': [['Single Size - 190x120 cm', 334, 477], ['Queen - 200x160 cm', 490, 700], ['Single Size - 200x120 cm', 364, 520], ['Single Size - 200x90 cm', 273, 390], ['Single Size - 190x90 cm', 259, 370], ['King - 200x180 cm', 546, 780], ['Super King Size - 200x200 cm', 602, 860], ['Queen - 200x150 cm', 455, 650]],
  'emma-bed-set': [['King - 200x180 cm', 2667, 4030], ['Queen - 200x160 cm', 2373, 3590], ['Super King Size - 200x200 cm', 2975, 4500], ['Queen - 200x150 cm', 2226, 3370], ['Single Size - 200x120 cm', 1771, 2680]],
  'fabian-6-seater-sofa-set': [['6 seater', 2660, 4185], ['3 seater', 2520, 3800]],
  'fenix-bed': [['King - 200x180 cm', 2212, 3330], ['Single Size - 200x120 cm', 1799, 2690]],
  'fenix-hydraulic-bed': [['200x160 - Queen', 2996, 4279], ['200x120 - Single', 2395, 3421], ['200x180 - King', 3318, 4740], ['200x200 - Super King', 3395, 4850], ['200x150 - Double', 2954, 4220], ['200x140 - Double', 2786, 3980]],
  'fiona-bed': [['King - 200x180 cm', 2597, 3990], ['Queen - 200x160 cm', 2422, 3722], ['Super King Size - 200x200 cm', 2877, 4421], ['Queen - 200x150 cm', 2261, 3475], ['Single Size - 200x120 cm', 1820, 2787]],
  'flame-box-top-pocket-spring-mattress': [['Queen - 200x150 cm', 1686, 2800], ['Super King Size - 200x200 cm', 2245, 3730], ['King - 200x180 cm', 2023, 3360], ['Single Size - 190x90 cm', 963, 1600], ['Queen - 200x160 cm', 1794, 2980], ['Double - 200x140', 1574, 2615]],
  'flare-box-top-spring-mattress': [['Queen - 200x160 cm', 1946, 2780], ['Single Size - 200x120 cm', 1463, 2090], ['Single Size - 200x90 cm', 1099, 1570], ['Single Size - 190x90 cm', 1043, 1490], ['King - 200x180 cm', 2184, 3120], ['Super King Size - 200x200 cm', 2429, 3470], ['Queen - 200x150 cm', 1820, 2600]],
  'flexi-bed': [['Double Size - 190x150 cm', 1407, 2180], ['Single Size - 190x90 cm', 924, 1420], ['Single Size - 190x120 cm', 1169, 1805], ['Double - 200x140 cm', 1435, 2215]],
  'freya-kids-foam-mattress': [['Single Size - 150x70 cm', 245, 350], ['Single Size - 190x150 cm', 623, 890], ['Single Size - 200x120 cm', 532, 760], ['Single Size - 190x90 cm', 378, 540], ['Single Size - 190x120 cm', 497, 710]],
  'gatsby-hydraulic-bed': [['200x160 - Queen', 2982, 4260], ['200x180 - King', 3199, 4570], ['200x200 - Super King', 3360, 4800]],
  'glide-bed': [['Single Size - 200x120 cm', 2100, 3000], ['Queen - 200x150 cm', 2499, 3570], ['Super King Size - 200x200 cm', 3332, 4760], ['Queen - 200x160 cm', 2667, 3810], ['King - 200x180 cm', 2996, 4280]],
  'glow-pillow-top-pocket-spring-mattress': [['Queen - 200x150 cm', 1365, 1950], ['Super King Size - 200x200 cm', 1820, 2600], ['King - 200x180 cm', 1638, 2340], ['Single Size - 200x90 cm', 819, 1170], ['Single Size - 200x120 cm', 1092, 1560], ['Queen - 200x160 cm', 1456, 2080]],
  'hanna-gel-infused-foam-pocket-spring-mattress': [['Queen - 200x150 cm', 1344, 1920], ['Super King Size - 200x200 cm', 1792, 2560], ['King - 200x180 cm', 1614, 2305], ['Single Size - 190x90 cm', 767, 1095], ['Single Size - 200x90 cm', 809, 1155], ['Single Size - 200x120 cm', 1075, 1535], ['Queen - 200x160 cm', 1435, 2050]],
  'hazel-latex-038-gel-infused-foam-pocket-spring-mattress': [['Queen - 200x160 cm', 2163, 4160], ['Single Size - 200x120 cm', 1622, 3120], ['Single Size - 200x90 cm', 1217, 2340], ['Single Size - 190x90 cm', 1160, 2230], ['King - 200x180 cm', 2434, 4680], ['Super King Size - 200x200 cm', 2704, 5200], ['Queen - 200x150 cm', 2028, 3900]],
  'ignite-pillow-top-pocket-spring-mattress': [['Queen - 200x150 cm', 1708, 2440], ['Super King Size - 200x200 cm', 2282, 3260], ['King - 200x180 cm', 2051, 2930], ['Single Size - 190x90 cm', 980, 1400], ['Single Size - 200x90 cm', 1029, 1470], ['Single Size - 200x120 cm', 1372, 1960], ['Queen - 200x160 cm', 1827, 2610]],
  'indigo-pocket-spring-mattress': [['Queen - 200x160 cm', 3057, 6260], ['Single Size - 200x120 cm', 2295, 4700], ['King - 200x180 cm', 3438, 7040], ['Super King Size - 200x200 cm', 3819, 7820]],
  'ivy-kids-bonnell-spring-mattress': [['Single Size - 190x90 cm', 455, 650], ['Single Size - 200x120 cm', 637, 910]],
  'jade-box-top-pocket-spring-mattress': [['Queen - 200x160 cm', 3164, 4520], ['Single Size - 200x120 cm', 2373, 3390], ['Single Size - 200x90 cm', 1778, 2540], ['Single Size - 190x90 cm', 1694, 2420], ['King - 200x180 cm', 3556, 5080], ['Super King Size - 200x200 cm', 3948, 5640], ['Queen - 200x150 cm', 2961, 4230]],
  'jasper-foam-mattress': [['Queen - 200x160 cm', 641, 916], ['Single Size - 200x120 cm', 476, 680], ['Single Size - 190x90 cm', 336, 480], ['King - 200x180 cm', 714, 1020], ['Super King Size - 200x200 cm', 791, 1130], ['Queen - 200x150 cm', 595, 850]],
  'jesse-bed-44d9ed': [['King - 200x180 cm', 1981, 3030], ['Queen - 200x160 cm', 1890, 2880], ['Queen - 200x150 cm', 1834, 2790], ['Single Size - 200x120 cm', 1722, 2610], ['Double - 200x140 cm', 1834, 2780]],
  'jude-bed': [['Queen - 200x160 cm', 1666, 2485], ['Super King Size - 200x200 cm', 1876, 2815], ['Single Size - 200x90 cm', 1141, 1695], ['Single Size - 200x120 cm', 1428, 2130], ['Double - 200x140 cm', 1554, 2320]],
  'katy-bed': [['King - 200x180 cm', 1694, 2610], ['Queen - 200x160 cm', 1617, 2495], ['Super King Size - 200x200 cm', 1827, 2820], ['Queen - 200x150 cm', 1568, 2410], ['Single Size - 200x120 cm', 1470, 2240]],
  'lena-bed': [['King - 200x180 cm', 1967, 2940], ['Queen - 200x160 cm', 1855, 2770], ['Super King Size - 200x200 cm', 2121, 3180], ['Single Size - 200x90 cm', 1526, 2255], ['Queen - 200x150 cm', 1820, 2742], ['Single Size - 200x120 cm', 1708, 2550]],
  'lima-accent-chair': [['1 Seater', 763, 1090], ['2 Seater', 763, 1090], ['3 Seater', 763, 1090]],
  'liniya-bed': [['Single Size - 200x90 cm', 1260, 1905], ['Single Size - 190x90 cm', 1141, 1725]],
  'luca-bed': [['King - 200x180 cm', 1988, 2990], ['Queen - 200x160 cm', 1869, 2815], ['Super King Size - 200x200 cm', 2177, 3280], ['Queen - 200x150 cm', 1785, 2682], ['Single Size - 200x120 cm', 1554, 2325], ['Double - 200x140 cm', 1701, 2550]],
  'luna-bed': [['Single Size - 200x90 cm', 1197, 1810], ['Single Size - 200x120 cm', 1610, 2425], ['Queen - 200x150 cm', 1799, 2735], ['Queen - 200x160 cm', 1876, 2850], ['King - 200x180 cm', 2009, 3050], ['Super King Size - 200x200 cm', 2212, 3360]],
  'luna-spring-mattress': [['Queen - 200x150 cm', 665, 950], ['Super King Size - 200x200 cm', 882, 1260], ['King - 200x180 cm', 798, 1140], ['Single Size - 190x90 cm', 378, 540], ['Single Size - 200x90 cm', 399, 570], ['Single Size - 200x120 cm', 532, 760], ['Queen - 200x160 cm', 707, 1010], ['Single Size - 190x120 cm', 518, 740], ['Double Size - 190x150 cm', 658, 940]],
  'lyla-bed': [['Queen - 200x160 cm', 2095, 3123], ['Super King Size - 200x200 cm', 2395, 3591], ['Single Size - 200x90 cm', 1435, 2135], ['Queen - 200x150 cm', 2044, 3040], ['Single Size - 200x120 cm', 1795, 2669], ['Single Size - 190x120 cm', 1799, 2675]],
  'mandrid-bed': [['Single Size - 190x90 cm', 1106, 1680], ['Single Size - 190x120 cm', 1407, 2135], ['Double - 200x140 cm', 1729, 2620]],
  'masafi-bed': [['King - 200x180 cm', 2093, 3140], ['Queen - 200x160 cm', 1995, 2995], ['Queen - 200x150 cm', 1936, 2885], ['Single Size - 200x120 cm', 1673, 2505], ['Double - 200x140 cm', 1873, 2805]],
  'melvin-bed-bench-with-storage-aa177c': [['100 cm', 392, 560], ['120 cm', 455, 650], ['150 cm', 567, 810], ['180 cm', 686, 980]],
  'merlyn-bed': [['Double Size - 190x150 cm', 1988, 3025], ['King - 200x180 cm', 2261, 3440], ['Queen - 200x160 cm', 2114, 3216], ['Super King Size - 200x200 cm', 2513, 3824]],
  'mia-memory-foam-pillow-top-pocket-spring-mattress': [['Queen - 200x160 cm', 1700, 3400], ['Single Size - 200x120 cm', 1280, 2560], ['Single Size - 200x90 cm', 960, 1920], ['Single Size - 190x90 cm', 910, 1820], ['King - 200x180 cm', 1915, 3830], ['Super King Size - 200x200 cm', 2125, 4250], ['Queen - 200x150 cm', 1595, 3190]],
  'monarch-bed': [['King - 200x180 cm', 2954, 4420], ['Queen - 200x160 cm', 2786, 4165], ['Super King Size - 200x200 cm', 3199, 4800], ['Single Size - 200x90 cm', 1890, 2820], ['Queen - 200x150 cm', 2730, 4080], ['Single Size - 200x120 cm', 2380, 3545]],
  'mylo-king-bed': [['King - 200x180 cm', 2807, 4190], ['Super King Size - 200x200 cm', 3031, 4530], ['Queen - 200x150 cm', 2569, 3830]],
  'naboodah-bed': [['King - 200x180 cm', 2240, 3360], ['Queen - 200x160 cm', 2149, 3210]],
  'nataly-bed': [['King - 200x180 cm', 2597, 3950], ['Queen - 200x160 cm', 2422, 3673], ['Queen - 200x150 cm', 2254, 3420]],
  'nayra-bed': [['King - 200x180 cm', 2786, 4140], ['Queen - 200x160 cm', 2450, 3630], ['Single Size - 200x90 cm', 1554, 2300], ['Queen - 200x150 cm', 2373, 3515], ['Single Size - 200x120 cm', 2016, 2985]],
  'neon-bed': [['King - 200x180 cm', 2541, 3800], ['Queen - 200x160 cm', 2373, 3550], ['Super King Size - 200x200 cm', 2828, 4230], ['Queen - 200x150 cm', 2240, 3355], ['Single Size - 200x120 cm', 2016, 3005]],
  'nexo-bed-bench-cdb0d4': [['160 cm', 672, 960], ['180 cm', 721, 1030], ['200 cm', 805, 1150]],
  'orleans-bed': [['King - 200x180 cm', 1895, 2877], ['Queen - 200x160 cm', 1595, 2429], ['Super King Size - 200x200 cm', 2095, 3183], ['Queen - 200x150 cm', 1638, 2480], ['Single Size - 200x120 cm', 1295, 1970]],
  'otis-bed': [['Queen - 200x160 cm', 2240, 3360], ['Super King Size - 200x200 cm', 2499, 3760], ['Single Size - 200x90 cm', 1463, 2185], ['Queen - 200x150 cm', 2156, 3230], ['Single Size - 200x120 cm', 1890, 2830]],
  'pablo-bed': [['King - 200x180 cm', 1495, 2286], ['Queen - 200x160 cm', 1395, 2133], ['Super King Size - 200x200 cm', 1695, 2591], ['Queen - 200x150 cm', 1337, 2045], ['Single Size - 200x120 cm', 1195, 1792]],
  'pulse-bed': [['Single Size - 200x90 cm', 1204, 1820], ['Single Size - 200x120 cm', 1595, 2409], ['King Size - 220x220', 2730, 4140]],
  'reflex-bed': [['King - 200x180 cm', 3010, 4710], ['Queen - 200x160 cm', 2919, 4540], ['Super King Size - 200x200 cm', 3248, 5090], ['Single Size - 200x90 cm', 1883, 2920], ['Queen - 200x150 cm', 2765, 4300], ['Single Size - 200x120 cm', 2408, 3730]],
  'restwell-foam-latex-mattress': [['Queen - 200x160 cm', 1066, 1640], ['Single Size - 200x120 cm', 799, 1229], ['Single Size - 200x90 cm', 599, 922], ['Single Size - 190x90 cm', 549, 845], ['King - 200x180 cm', 1203, 1850], ['Super King Size - 200x200 cm', 1331, 2048], ['Queen - 200x150 cm', 1001, 1540]],
  'retreat-bed': [['King - 200x180 cm', 2495, 3804], ['Queen - 200x160 cm', 2395, 3646], ['Super King Size - 200x200 cm', 2695, 4115], ['Single Size - 200x90 cm', 1554, 2360], ['Queen - 200x150 cm', 2296, 3500], ['Single Size - 200x120 cm', 1995, 3018]],
  'rihla-bed-bench': [['120 cm', 616, 880], ['160 cm', 812, 1160]],
  'riko-memory-foam-pocket-spring-mattress': [['Queen - 200x160 cm', 1349, 3130], ['Single Size - 200x120 cm', 1009, 2340], ['Single Size - 200x90 cm', 759, 1760], ['Single Size - 190x90 cm', 720, 1670], ['King - 200x180 cm', 1513, 3510], ['Super King Size - 200x200 cm', 1686, 3910], ['Queen - 200x150 cm', 1263, 2930]],
  'riza-bed': [['King - 200x180 cm', 1995, 3030], ['Queen - 200x160 cm', 1795, 2744], ['Super King Size - 200x200 cm', 2095, 3193], ['Queen - 200x150 cm', 1799, 2725], ['Single Size - 190x90 cm', 1225, 1850], ['Single Size - 200x120 cm', 1495, 2266], ['Double - 200x140 cm', 1722, 2610]],
  'ruby-pocket-spring-mattress': [['Queen - 200x160 cm', 1316, 1880], ['Single Size - 200x120 cm', 987, 1410], ['Single Size - 190x90 cm', 707, 1010], ['King - 200x180 cm', 1477, 2110], ['Super King Size - 200x200 cm', 1638, 2340], ['Queen - 200x150 cm', 1232, 1760]],
  'sadie-bed': [['King - 200x180 cm', 2095, 3143], ['Queen - 200x160 cm', 1995, 2990], ['Super King Size - 200x200 cm', 2295, 3444], ['Single Size - 200x90 cm', 1365, 2045], ['Queen - 200x150 cm', 1974, 2950], ['Single Size - 200x120 cm', 1695, 2531]],
  'sear-pocket-spring-mattress': [['Queen - 200x150 cm', 1792, 2560], ['Super King Size - 200x200 cm', 2394, 3420], ['King - 200x180 cm', 2149, 3070], ['Single Size - 190x90 cm', 1022, 1460], ['Single Size - 200x120 cm', 1435, 2050], ['Queen - 200x160 cm', 1911, 2730]],
  'sedera-bed': [['King - 200x180 cm', 2737, 4170], ['Queen - 200x160 cm', 2548, 3854]],
  'serene-spring-mattress': [['Double - 200x140', 683, 975], ['Queen - 200x160 cm', 795, 1136], ['Single Size - 200x120 cm', 441, 630], ['Single Size - 190x90 cm', 420, 600], ['King - 200x180 cm', 895, 1279], ['Super King Size - 200x200 cm', 995, 1421]],
  'shadow-latex-pocket-spring-mattress': [['Queen - 200x160 cm', 3108, 7770], ['Single Size - 200x120 cm', 2332, 5830], ['King - 200x180 cm', 3496, 8740], ['Super King Size - 200x200 cm', 3888, 9720], ['Queen - 200x150 cm', 2916, 7290]],
  'sienna-ottoman': [['1 seater', 875, 1250], ['Standard', 875, 1250]],
  'spark-bonnell-spring-mattress': [['Queen - 200x160 cm', 1060, 1860], ['Single Size - 200x120 cm', 798, 1400], ['Single Size - 200x90 cm', 599, 1050], ['Single Size - 190x90 cm', 570, 1000], ['King - 200x180 cm', 1191, 2090], ['Super King Size - 200x200 cm', 1322, 2320], ['Queen - 200x150 cm', 992, 1740]],
  'stanhope-bed-bench-7ec638': [['100 cm', 518, 740], ['160 cm', 777, 1110], ['180 cm', 819, 1170], ['200 cm', 924, 1320], ['140 cm', 679, 970]],
  'stanhope-divan-bed-set': [['Single Size - 200x90 cm', 1043, 1595], ['Queen - 200x150 cm', 1694, 2590]],
  'staten-accent-chair': [['1 Seater', 1036, 1480], ['2 Seater', 1036, 1480], ['3 Seater', 1036, 1480]],
  'stratus-bed': [['Super King Size - 200x200 cm', 2254, 3420], ['Single Size - 200x90 cm', 1260, 1900], ['Queen - 200x150 cm', 1855, 2805]],
  'styris-bed': [['King - 200x180 cm', 2786, 4120], ['Queen - 200x160 cm', 2583, 3825], ['Queen - 200x150 cm', 2485, 3675]],
  'sunny-bed': [['King - 200x180 cm', 1841, 2910], ['Queen - 200x160 cm', 1750, 2740], ['Super King Size - 200x200 cm', 1981, 3130], ['Single Size - 200x90 cm', 1428, 2180], ['Queen - 200x150 cm', 1701, 2660], ['Single Size - 200x120 cm', 1593, 2457]],
  'tangent-bed': [['King - 200x180 cm', 3003, 4510], ['Queen - 200x160 cm', 2786, 4180], ['Super King Size - 200x200 cm', 3304, 4970], ['Queen - 200x150 cm', 2625, 3940], ['Single Size - 200x120 cm', 2100, 3150]],
  'temperature-controlled-mattress-topper': [['200x180 - king size', 553, 790], ['200x160 - queen size', 497, 710], ['200x150 - queen size', 469, 670], ['200x100 - single size', 308, 440], ['200x200 - Super king size', 616, 880]],
  'the-adeline-single-seater-sofa': [['1 Seater', 1141, 1630], ['2 Seater', 1141, 1630], ['3 Seater', 1141, 1630]],
  'the-barlow-bed': [['King - 200x180 cm', 1680, 2520], ['Queen - 200x160 cm', 1600, 2395], ['Super King Size - 200x200 cm', 1813, 2730], ['Single Size - 200x90 cm', 1302, 1930], ['Queen - 200x150 cm', 1554, 2320], ['Single Size - 200x120 cm', 1456, 2170]],
  'the-blair-bed': [['King - 200x180 cm', 2153, 3235], ['Queen - 200x160 cm', 2048, 3085], ['Super King Size - 200x200 cm', 2310, 3480], ['Single Size - 200x90 cm', 1666, 2480], ['Queen - 200x150 cm', 1988, 2980], ['Single Size - 200x120 cm', 1862, 2770]],
  'the-brook-bed': [['King - 200x180 cm', 2289, 3560], ['Queen - 200x160 cm', 2181, 3365], ['Super King Size - 200x200 cm', 2471, 3850], ['Single Size - 200x90 cm', 1778, 2690], ['Single Size - 200x120 cm', 1988, 3030], ['Queen - 200x150 cm', 2121, 3270]],
  'the-carter-bed': [['King - 200x180 cm', 2096, 3213], ['Queen - 200x160 cm', 1996, 3050], ['Super King Size - 200x200 cm', 2296, 3519], ['Single Size - 200x120 cm', 1695, 2581]],
  'the-century-bed': [['King - 200x180 cm', 2807, 4150], ['Queen - 200x150 cm', 2583, 3815]],
  'the-chalis-single-seater-sofa': [['1 Seater', 861, 1230], ['2 Seater', 861, 1230], ['3 Seater', 861, 1230]],
  'the-charm-smart-bed-with-2-side-tables-f414c9': [['Queen - 200x160 cm', 2198, 3290], ['Super King Size - 200x200 cm', 2492, 3750], ['Single Size - 200x90 cm', 1120, 1680], ['Single Size - 200x120 cm', 2002, 2980]],
  'the-cheryl-single-seater-sofa': [['1 Seater', 1274, 1820], ['2 Seater', 1274, 1820], ['3 Seater', 1274, 1820]],
  'the-chime-bed': [['King - 200x180 cm', 1834, 2760], ['Queen - 200x160 cm', 1743, 2614], ['Super King Size - 200x200 cm', 1974, 2980], ['Single Size - 200x90 cm', 1421, 2110], ['Single Size - 200x120 cm', 1589, 2370], ['Double - 200x140 cm', 1694, 2530]],
  'the-coccon-bed': [['King - 200x180 cm', 2338, 3500], ['Queen - 200x160 cm', 2240, 3345], ['Single Size - 200x90 cm', 1463, 2180], ['Queen - 200x150 cm', 2156, 3220], ['Single Size - 200x120 cm', 1890, 2810]],
  'the-coccon-hydraulic-bed': [['200x160 - Queen', 2688, 3840], ['200x180 - King', 2786, 3980]],
  'the-dream-bed': [['King - 200x180 cm', 1568, 2410], ['Queen - 200x160 cm', 1495, 2285], ['Super King Size - 200x200 cm', 1694, 2610], ['Single Size - 200x90 cm', 1218, 1830], ['Queen - 200x150 cm', 1456, 2220], ['Single Size - 200x120 cm', 1365, 2070]],
  'the-elipse-bed': [['King - 200x180 cm', 2097, 3165], ['Queen - 200x160 cm', 1995, 3000], ['Super King Size - 200x200 cm', 2261, 3420], ['Single Size - 200x90 cm', 1701, 2530], ['Queen - 200x150 cm', 1946, 2920], ['Single Size - 200x120 cm', 1820, 2720]],
  'the-elliot-bed': [['Double Size - 190x150 cm', 1862, 2800], ['King - 200x180 cm', 2023, 3060], ['Queen - 200x160 cm', 1925, 2900], ['Super King Size - 200x200 cm', 2184, 3310], ['Single Size - 200x90 cm', 1568, 2340], ['Single Size - 200x120 cm', 1750, 2620]],
  'the-emma-bed-bench-with-storage-a4e4d9': [['150 cm', 861, 1230], ['160 cm', 896, 1280], ['180 cm', 987, 1410]],
  'the-fitz-bed': [['Super King Size - 200x200 cm', 1316, 2030], ['Single Size - 200x90 cm', 742, 1135], ['Queen - 200x150 cm', 1036, 1600], ['Single Size - 190x90 cm', 634, 981], ['Single Size - 200x120 cm', 931, 1430], ['Double - 200x140 cm', 987, 1520]],
  'the-fox-single-seater-sofa': [['1 Seater', 966, 1380], ['3 Seater', 1787, 2553], ['2 Seater', 1413, 2019]],
  'the-harris-bed': [['Double Size - 190x150 cm', 2541, 3860], ['King - 200x180 cm', 2814, 4280], ['Queen - 200x160 cm', 2625, 3990], ['Super King Size - 200x200 cm', 2996, 4570], ['Single Size - 200x90 cm', 1764, 2690], ['Single Size - 200x120 cm', 2254, 3410]],
  'the-hollis-bed': [['King - 200x180 cm', 1764, 2660], ['Queen - 200x160 cm', 1680, 2520], ['Super King Size - 200x200 cm', 1904, 2870], ['Single Size - 200x90 cm', 1372, 2040], ['Queen - 200x150 cm', 1631, 2440], ['Single Size - 200x120 cm', 1533, 2280]],
  'the-lava-headboard-with-bed-frame': [['King - 200x180 cm', 2927, 4430], ['Queen - 200x160 cm', 2787, 4180], ['Super King Size - 200x200 cm', 3158, 4760], ['Single Size - 200x120 cm', 2538, 3775]],
  'the-ledge-bed-with-drawers-200x120-single-size': [['Bed size', 2608, 3725], ['Single', 2608, 3725]],
  'the-lenor-bed': [['King - 200x180 cm', 2093, 3180], ['Queen - 200x160 cm', 1995, 3020], ['Super King Size - 200x200 cm', 2254, 3430], ['Single Size - 200x90 cm', 1624, 2420], ['Queen - 200x150 cm', 1936, 2925], ['Double - 200x140 cm', 1936, 2915]],
  'the-lima-accent-chair': [['1 Seater', 763, 1090], ['2 Seater', 763, 1090], ['3 Seater', 763, 1090]],
  'the-lowry-bed': [['Double Size - 190x150 cm', 2051, 3120], ['Single Size - 200x120 cm', 1795, 2724], ['Double - 200x140 cm', 2009, 3050]],
  'the-lowry-hydraulic-bed': [['200x160 - Queen', 2395, 3421], ['200x120 - Single', 2095, 2993], ['200x180 - King', 2595, 3707], ['200x200 - Super King', 2695, 3850]],
  'the-malden-hydraulic-bed': [['King - 200x180 cm', 2776, 4205], ['Queen - 200x160 cm', 2647, 3993], ['Super King Size - 200x200 cm', 2997, 4547]],
  'the-miles-bed-571d0b': [['King - 200x180 cm', 2205, 3342], ['Queen - 200x160 cm', 2100, 3170], ['Single Size - 200x120 cm', 1911, 2860], ['Double - 200x140 cm', 2044, 3080]],
  'the-morgan-bed': [['King - 200x180 cm', 2296, 3493], ['Queen - 200x160 cm', 2184, 3310], ['Super King Size - 200x200 cm', 2478, 3780], ['Single Size - 200x90 cm', 1785, 2660], ['Queen - 200x150 cm', 2128, 3220], ['Single Size - 200x120 cm', 1995, 3010]],
  'the-ninea-6-seater-sofa': [['6 seater', 142, 540], ['1 seater', 1125, 1630], ['2 seater', 1628, 2330], ['3 seater', 2250, 3250]],
  'the-nobles-bed-bench-with-storage-fc76b1': [['160 cm', 882, 1260], ['180 cm', 952, 1360], ['175 cm', 924, 1320]],
  'the-ocean-bed': [['King - 200x180 cm', 2310, 3530], ['Queen - 200x160 cm', 2198, 3340], ['Super King Size - 200x200 cm', 2492, 3810], ['Single Size - 200x90 cm', 1792, 2680], ['Queen - 200x150 cm', 2142, 3250], ['Single Size - 200x120 cm', 2002, 3010]],
  'the-oscar-bed': [['Queen - 200x160 cm', 1996, 2980], ['Super King Size - 200x200 cm', 2196, 3296], ['Queen - 200x150 cm', 1891, 2825], ['Single Size - 200x120 cm', 1695, 2526], ['Double - 200x140 cm', 1807, 2700]],
  'the-oscar-hydraulic-bed': [['200x120 - Single', 1995, 2850], ['200x200 - Super King', 2895, 4136], ['200x150 - Double', 2380, 3400]],
  'the-pillar-bed': [['King - 200x180 cm', 2597, 3970], ['Queen - 200x160 cm', 2496, 3805], ['Super King Size - 200x200 cm', 2800, 4290]],
  'the-rainbow-bed': [['King - 200x180 cm', 1575, 2470], ['Queen - 200x160 cm', 1498, 2340], ['Super King Size - 200x200 cm', 1701, 2670], ['Single Size - 200x90 cm', 1218, 1850], ['Queen - 200x150 cm', 1456, 2260], ['Single Size - 200x120 cm', 1365, 2094]],
  'the-rene-bed': [['King - 200x180 cm', 1470, 2220], ['Queen - 200x160 cm', 1397, 2105], ['Super King Size - 200x200 cm', 1589, 2410], ['Single Size - 200x90 cm', 1141, 1690], ['Queen - 200x150 cm', 1365, 2050], ['Single Size - 200x120 cm', 1274, 1910]],
  'the-rowan-bed': [['Queen - 200x160 cm', 1890, 2880], ['Single Size - 200x120 cm', 1638, 2485]],
  'the-spring-bed': [['King - 200x180 cm', 3031, 4670], ['Queen - 200x160 cm', 2835, 4370], ['Super King Size - 200x200 cm', 3269, 5050], ['Queen - 200x150 cm', 2828, 4309], ['Single Size - 200x120 cm', 2342, 3585], ['Double - 200x140 cm', 2835, 4320]],
  'the-stokes-bed': [['King - 200x180 cm', 2170, 3350], ['Queen - 200x160 cm', 2065, 3170], ['Super King Size - 200x200 cm', 2338, 3620], ['Single Size - 200x90 cm', 1680, 2510], ['Queen - 200x150 cm', 2009, 3080], ['Single Size - 200x120 cm', 1883, 2860]],
  'the-swift-bed': [['Queen - 200x160 cm', 2422, 3640], ['Queen - 200x150 cm', 2338, 3515]],
  'the-troop-single-seater-sofa': [['1 Seater', 893, 1275], ['2 Seater', 893, 1275], ['3 Seater', 893, 1275]],
  'the-troop-single-seater-sofa-29ff19': [['1 Seater', 893, 1275], ['2 Seater', 893, 1275], ['3 Seater', 893, 1275]],
  'the-vinicius-bed-with-built-in-foot-bench': [['King - 200x180 cm', 2795, 4280], ['Queen - 200x160 cm', 2662, 4060], ['Super King Size - 200x200 cm', 3018, 4630], ['Single Size - 200x90 cm', 2166, 3240], ['Queen - 200x150 cm', 2585, 3940], ['Single Size - 200x120 cm', 2424, 3660]],
  'the-wave-bed': [['King - 200x180 cm', 1967, 2980], ['Queen - 200x160 cm', 1806, 2730], ['Super King Size - 200x200 cm', 2135, 3240], ['Single Size - 200x90 cm', 1232, 1860], ['Queen - 200x150 cm', 1722, 2605], ['Single Size - 200x120 cm', 1477, 2235]],
  'the-winston-bed': [['King - 200x180 cm', 2205, 3330], ['Queen - 200x160 cm', 2100, 3160], ['Super King Size - 200x200 cm', 2380, 3600], ['Single Size - 200x120 cm', 1911, 2850], ['Double - 200x140 cm', 2016, 3020]],
  'the-wire-bed': [['King - 200x180 cm', 1407, 2150], ['Queen - 200x160 cm', 1344, 2040], ['Super King Size - 200x200 cm', 1519, 2330], ['Single Size - 200x90 cm', 1092, 1640], ['Queen - 200x150 cm', 1302, 1990], ['Single Size - 200x120 cm', 1225, 1850]],
  'tocsa-bed': [['King - 200x180 cm', 2450, 3670], ['Queen - 200x160 cm', 2289, 3420], ['Super King Size - 200x200 cm', 2667, 4000], ['Single Size - 200x90 cm', 1470, 2195], ['Queen - 200x150 cm', 2205, 3300], ['Single Size - 200x120 cm', 1876, 2805]],
  'tocsa-hydraulic-bed': [['200x160 - Queen', 2618, 3740], ['200x120 - Single', 2205, 3150], ['200x180 - King', 2779, 3970]],
  'tranquillo-bonnell-spring-mattress': [['Queen - 200x160 cm', 1014, 1560], ['Single Size - 200x120 cm', 761, 1170], ['Single Size - 200x90 cm', 572, 880], ['Single Size - 190x90 cm', 540, 830], ['King - 200x180 cm', 1138, 1750], ['Super King Size - 200x200 cm', 1268, 1950], ['Queen - 200x150 cm', 943, 1450]],
  'tulip-7-zone-pocket-spring-mattress': [['Queen - 200x160 cm', 1435, 2050], ['Single Size - 200x120 cm', 1071, 1530], ['Single Size - 200x90 cm', 803, 1147], ['King - 200x180 cm', 1607, 2295], ['Super King Size - 200x200 cm', 1785, 2550], ['Queen - 200x150 cm', 1339, 1913]],
  'tuscany-bed': [['Double Size - 190x150 cm', 2674, 4020], ['King - 200x180 cm', 2912, 4400], ['Queen - 200x160 cm', 2744, 4135], ['Single Size - 200x120 cm', 2331, 3490]],
  'tuscany-bed-bench-1851e6': [['160 cm', 812, 1160], ['180 cm', 896, 1280]],
  'valencia-accent-chair': [['1 Seater', 1624, 2320], ['2 Seater', 1624, 2320], ['3 Seater', 1624, 2320]],
  'vancouver-hydraulic-bed': [['200x160 - Queen', 2296, 3280], ['200x120 - Single', 1890, 2700], ['200x180 - King', 2422, 3460], ['200x200 - Super King', 2611, 3730]],
  'venice-pro-bed': [['King - 200x180 cm', 2163, 3290], ['Queen - 200x160 cm', 1995, 3035], ['Super King Size - 200x200 cm', 2394, 3540], ['Single Size - 200x90 cm', 1274, 1930], ['Queen - 200x150 cm', 1883, 2870], ['Single Size - 200x120 cm', 1638, 2485], ['Double - 200x140 cm', 1806, 2750]],
  'vertical-bed': [['Queen - 200x160 cm', 1862, 2880], ['Super King Size - 200x200 cm', 2205, 3410], ['Queen - 200x150 cm', 1729, 2670], ['Single Size - 200x120 cm', 1526, 2356]],
  'vibrant-bed': [['Single Size - 200x120 cm', 1050, 1500], ['Single Size - 190x90 cm', 805, 1150], ['Queen - 200x150 cm', 1358, 1940], ['Single Size - 200x90 cm', 847, 1210], ['Super King Size - 200x200 cm', 1673, 2390], ['Queen - 200x160 cm', 1414, 2020], ['King - 200x180 cm', 1512, 2160]],
  'yuki-memory-foam-box-top-pocket-spring-mattress': [['Queen - 200x160 cm', 1740, 2900], ['Single Size - 200x120 cm', 1308, 2180], ['Single Size - 200x90 cm', 978, 1630], ['Single Size - 190x90 cm', 936, 1560], ['King - 200x180 cm', 1956, 3260], ['Super King Size - 200x200 cm', 2178, 3630], ['Queen - 200x150 cm', 1632, 2720]],
  'yuri-gel-infused-memory-foam-pocket-spring-mattress': [['Queen - 200x160 cm', 2905, 4150], ['Single Size - 200x120 cm', 2184, 3120], ['Single Size - 190x90 cm', 1554, 2220], ['King - 200x180 cm', 3269, 4670], ['Super King Size - 200x200 cm', 3633, 5190], ['Queen - 200x150 cm', 2730, 3900]],
  'zenera-box-top-spring-mattress': [['Queen - 200x160 cm', 1742, 2680], ['Single Size - 200x120 cm', 1307, 2010], ['Single Size - 200x90 cm', 1008, 1550], ['Single Size - 190x90 cm', 936, 1440], ['King - 200x180 cm', 1963, 3020], ['Super King Size - 200x200 cm', 2178, 3350], ['Queen - 200x150 cm', 1638, 2520]],
};

/**
 * The API slug is the catalogue id minus its leading number. A trailing hash is
 * part of the slug on some rows (`azilea-smart-pro-grid-mattress-56bb1d`) and
 * absent on others, so the hash-stripped form is the fallback.
 */
export function slugFromProductId(productId: string): string {
  return productId.split('::size=')[0].replace(/^\d+-/, '');
}

function rawSizesFor(productId: string): readonly RawSize[] | undefined {
  const slug = slugFromProductId(productId);
  return RAW_SIZES[slug] || RAW_SIZES[slug.replace(/-[0-9a-f]{6}$/, '')];
}

/** Every official size of the product — empty when it has none. */
export function getOfficialSizes(productId: string): OfficialSize[] {
  const raw = rawSizesFor(productId);
  if (!raw) return [];
  return raw.map(([label, price, listPrice]) => ({ label, price, listPrice }));
}

/** True when the official Size dropdown has more than one option. */
export function hasOfficialSizes(productId: string): boolean {
  const raw = rawSizesFor(productId);
  return !!raw && raw.length > 1;
}

export type OfficialSizeFloor = {
  /** Cheapest priced official size — what the site actually charges "from". */
  price: number;
  /** That size's list price, when served. */
  listPrice?: number;
  /** How many official sizes carry a price (the honest size-count). */
  priced: number;
};

const floorCache = new Map<string, OfficialSizeFloor | undefined>();

/**
 * Cheapest priced official size for a catalog product — `undefined` when the
 * official list has no priced sizes. Listing cards must never sit ABOVE this
 * price: the product page charges exactly it for the cheapest size, and a feed
 * row that carries flat-discount "base product" arithmetic instead of a real
 * size price would otherwise show shoppers a price no size actually costs.
 */
export function officialSizeFloor(productId: string): OfficialSizeFloor | undefined {
  const id = productId.split('::size=')[0];
  if (floorCache.has(id)) return floorCache.get(id);
  const priced = (rawSizesFor(id) || []).filter((size) => Number.isFinite(size[1]) && (size[1] as number) > 0);
  let floor: OfficialSizeFloor | undefined;
  if (priced.length) {
    const cheapest = priced.reduce((a, b) => ((b[1] as number) < (a[1] as number) ? b : a));
    const listPrice = cheapest[2];
    floor = {
      price: cheapest[1] as number,
      listPrice: Number.isFinite(listPrice) ? (listPrice as number) : undefined,
      priced: priced.length,
    };
  }
  floorCache.set(id, floor);
  return floor;
}
