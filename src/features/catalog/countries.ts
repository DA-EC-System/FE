/**
 * Danh sách nước cho ô Xuất xứ (Documents/21 §17.2: `originCountry` là mã ISO 3166-1 alpha-2). Tên tiếng Việt lấy từ
 * `Intl.DisplayNames` của trình duyệt, không gọi API; BE đổi mã sang lựa chọn riêng của từng sàn lúc đẩy
 */
const CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC ' +
  'CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD ' +
  'GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH ' +
  'KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW ' +
  'MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC ' +
  'SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY ' +
  'UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW';

/** Nước hay gặp với hàng bán ở Việt Nam: đưa lên đầu danh sách */
const COMMON = ['VN', 'CN', 'TH', 'KR', 'JP', 'US'];

export interface CountryOption {
  code: string;
  name: string;
}

let names: Intl.DisplayNames | null | undefined;
function displayNames(): Intl.DisplayNames | null {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(['vi'], { type: 'region' });
    } catch {
      names = null;
    }
  }
  return names;
}

/** Tên tiếng Việt của mã nước; mã lạ thì trả lại chính mã */
export function countryName(code: string): string {
  return displayNames()?.of(code) ?? code;
}

let cache: CountryOption[] | null = null;

/** Mọi nước: nhóm hay gặp trước, còn lại xếp theo tên tiếng Việt */
export function countryOptions(): CountryOption[] {
  if (cache) return cache;
  const all = CODES.split(' ').map((code) => ({ code, name: countryName(code) }));
  const common = COMMON.map((c) => all.find((o) => o.code === c)!);
  const rest = all.filter((o) => !COMMON.includes(o.code)).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  cache = [...common, ...rest];
  return cache;
}

export const COMMON_COUNTRY_COUNT = COMMON.length;
