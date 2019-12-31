import DiacriticRemover from "@marketto/diacritic-remover";
import moment from "moment";
import { Belfiore } from "../belfiore-connector/belfiore";
import BelfioreConnector from "../belfiore-connector/classes/belfiore-connector.class";
import BelfiorePlace from "../belfiore-connector/types/belfiore-place.type";
import MultiFormatDate from "../belfiore-connector/types/multi-format-date.type";
import { ISO8601_SHORT_DATE } from "../const/date-matcher.const";
import { CONSONANT_LIST, VOWEL_LIST } from "../const/matcher.const";
import BirthMonth from "../enums/birth-month.enum";
import Omocodes from "../enums/omocodes.enum";
import IPersonalInfo from "../interfaces/personal-info.interface";
import DateDay from "../types/date-day.type";
import DateMonth from "../types/date-month.type";
import Genders from "../types/genders.type";
import CheckDigitizer from "./check-digitizer.class";
import Gender from "./gender.class";

const diacriticRemover = new DiacriticRemover();

export default class Parser {

    /**
     * Parse surname information
     * @param codiceFiscale Partial or complete Omocode/Regular CF to parse
     * @returns Regular CF w/o omocodes chars
     */
    public static cfDeomocode(codiceFiscale: string): string {
        if (codiceFiscale && codiceFiscale.length < 7) {
            return codiceFiscale;
        }
        const charReplacer = (char, position) => this.charOmocode(char, position);
        return codiceFiscale.replace(/[\dA-Z]/giu, charReplacer);
    }

    /**
     * Parse surname information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Partial/possible surname
     */
    public static cfToSurname(codiceFiscale: string): string | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 3 || !(/^[A-Z]{3}/iu).test(codiceFiscale)) {
            return null;
        }

        const surnameCf = codiceFiscale.substr(0, 3);

        const [cons = ""] = surnameCf.match(new RegExp(`^[${CONSONANT_LIST}]{1,3}`, "ig")) || [];
        const [vow = ""] = surnameCf.match(new RegExp(`[${VOWEL_LIST}]{1,3}`, "ig")) || [];

        const matchingLength = cons.length + vow.length;

        if (matchingLength < 2 || matchingLength < 3 && surnameCf[2].toUpperCase() !== "X") {
            return null;
        }

        switch (cons.length) {
        case 3:
            return (cons + vow).split("").join(this.JOLLY_CHAR) + this.JOLLY_CHAR;
        case 2:
            return `${cons[0]}${vow[0]}*${cons[1]}${this.JOLLY_CHAR}`;
        case 1:
            return `${cons[0]}${vow}${this.JOLLY_CHAR}`;
        default:
            return `${vow}${vow.length === 3 ? this.JOLLY_CHAR : ""}`;
        }
    }

    /**
     * Parse name information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Partial/possible name
     */
    public static cfToName(codiceFiscale: string): string | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 3 || !(/^[A-Z]{6}/iu).test(codiceFiscale)) {
            return null;
        }
        return this.cfToSurname(codiceFiscale.substr(3, 3));
    }

    /**
     * Parse gender information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Male or female
     */
    public static cfToGender(codiceFiscale: string): Genders | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 11) {
            return null;
        }
        const birthDay = parseInt(codiceFiscale.substr(9, 2), 10);
        return Gender.getGender(birthDay);
    }

    /**
     * Parse birth year information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Birth Year (4 digits)
     */
    public static cfToBirthYear(codiceFiscale: string): number | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 8) {
            return null;
        }
        const birthYear: number = parseInt(codiceFiscale.substr(6, 2), 10);

        if (isNaN(birthYear)) {
            return null;
        }

        const current2DigitsYear: number = parseInt(moment().format("YY"), 10);

        const century: number = (birthYear > current2DigitsYear ? 1 : 0) * 100;
        return moment().subtract(current2DigitsYear - birthYear + century, "years").year();
    }

    /**
     * Parse birth month information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Birth Month (0...11 - Date notation)
     */
    public static cfToBirthMonth(codiceFiscale: string): DateMonth | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 9) {
            return null;
        }

        const birthMonth = BirthMonth[codiceFiscale.substr(8, 1)];
        if (typeof birthMonth !== "number" || birthMonth < 0 || birthMonth > 11) {
            return null;
        }
        return birthMonth as DateMonth;
    }

    /**
     * Parse birth day information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Birth day (1..31)
     */
    public static cfToBirthDay(codiceFiscale: string): DateDay | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 11) {
            return null;
        }
        let birthDay = parseInt(codiceFiscale.substr(9, 2), 10);

        if (isNaN(birthDay)) {
            return null;
        }

        birthDay -= birthDay >= 40 ? 40 : 0;

        if (birthDay < 1 || birthDay > 31) {
            return null;
        }
        return birthDay as DateDay;
    }

    /**
     * Parse birth date information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Birth Date
     */
    public static cfToBirthDate(codiceFiscale: string): Date | null {
        const birthDay = this.cfToBirthDay(codiceFiscale);
        if (!birthDay) {
            return null;
        }

        const birthMonth = this.cfToBirthMonth(codiceFiscale);
        if (!birthMonth && birthMonth !== 0) {
            return null;
        }

        const birthYear = this.cfToBirthYear(codiceFiscale);
        if (!birthYear) {
            return null;
        }

        const dt = moment(Date.UTC(birthYear, birthMonth, birthDay));
        if (!dt.isValid()) {
            return null;
        }
        return dt.toDate();
    }

    /**
     * Parse birth place information
     * @param codiceFiscale Partial or complete CF to parse
     * @returns Birth place
     */
    public static cfToBirthPlace(codiceFiscale: string): BelfiorePlace | null {
        if (typeof codiceFiscale !== "string" || codiceFiscale.length < 15) {
            return null;
        }
        const belfioreCode: string = codiceFiscale.substr(11, 4).toUpperCase();
        const birthPlace: BelfiorePlace = Belfiore[belfioreCode];
        if (!birthPlace) {
            return null;
        }

        const {creationDate, expirationDate} = birthPlace;
        if (creationDate || expirationDate) {
            const birthDate = this.cfToBirthDate(codiceFiscale);
            if (!birthDate) {
                return null;
            }
            let validityCheck = true;
            if (creationDate) {
                validityCheck = moment(birthDate).isSameOrAfter(moment(creationDate));
            }
            if (validityCheck && expirationDate) {
                validityCheck = moment(birthDate).isSameOrBefore(moment(expirationDate));
            }
            if (!validityCheck) {
                return null;
            }
        }
        return birthPlace;
    }

    /**
     * @param fiscalCode 16 character Codice Fiscale to decode
     * @returns Decoded CF Info
     */
    public static cfDecode(fiscalCode: string): IPersonalInfo {
        const year = this.cfToBirthYear(fiscalCode);
        const month = this.cfToBirthMonth(fiscalCode);
        const day = this.cfToBirthDay(fiscalCode);
        return {
            name: this.cfToName(fiscalCode),
            surname: this.cfToSurname(fiscalCode),

            date: new Date(Date.UTC(year, month, day)),
            day,
            month,
            year,

            gender: this.cfToGender(fiscalCode),
            place: (this.cfToBirthPlace(fiscalCode) || {}).name,
        };
    }

    /**
     * Parse surname to cf part
     * @param surname Partial or complete CF to parse
     * @returns partial cf
     */
    public static surnameToCf(surname: string): string | null {
        if ((surname || "").trim().length < 2) {
            return null;
        }

        /*if (!(/^[A-Z "]+$/iu).test(noDiacriticsSurname)) {
            return null;
        }*/

        const consonants = this.charExtractor(surname, CONSONANT_LIST);
        const vowels = this.charExtractor(surname, VOWEL_LIST);

        const partialCf = (consonants + vowels)
            .padEnd(3, "X").substr(0, 3);

        if (partialCf.length < 3) {
            return null;
        }
        return partialCf.toUpperCase();
    }

    /**
     * Parse name to cf part
     * @param name Partial or complete CF to parse
     * @returns partial cf
     */
    public static nameToCf(name: string): string | null {
        if ((name || "").trim().length < 2) {
            return null;
        }
        const consonants = this.charExtractor(name, CONSONANT_LIST);
        if (consonants.length >= 4) {
            return (consonants[0] + consonants.substr(2, 2)).toUpperCase();
        }
        return this.surnameToCf(name);
    }

    /**
     * Parse year to cf part
     * @param year Birth year 2 or 4 digit string, number above 19XX or below 100
     * @returns partial cf
     */
    public static yearToCf(year: string | number): string | null {
        let parsedYear: number;
        if (typeof year === "string") {
            parsedYear = parseInt(year, 10);
        } else {
            parsedYear = year;
        }

        if (!(typeof parsedYear === "number" && !isNaN(parsedYear) && (parsedYear >= 1900 || parsedYear < 100))) {
            return null;
        }
        return `0${parsedYear}`.substr(-2);
    }

    /**
     * Parse month information
     * @param month Month number 0..11
     * @returns Birth Month CF code
     */
    public static monthToCf(month: DateMonth | number): string | null {
        if (month < 0 || month > 11) {
            return null;
        }

        return BirthMonth[month] || null;
    }

    /**
     * Parse day information
     * @param day Day number 1..31
     * @param gender Gender enum value
     * @returns Birth Day CF code
     */
    public static dayGenderToCf(day: DateDay | number, gender: Genders): string | null {
        if (day < 1 || day > 31) {
            return null;
        }

        const genderValue = Gender[gender];
        if (typeof genderValue !== "number") {
            return null;
        }
        return `0${day + genderValue}`.substr(-2);
    }

    /**
     * Parse Year, Month, Day to Dated
     * @param year 4 digits Year
     * @param month 1 or 2 digits Month 0..11
     * @param day 1,2 digits Day 1..31
     * @returns Date or null if provided year/month/day are not valid
     */
    public static yearMonthDayToDate(year: number, month: DateMonth = 0, day: DateDay = 1): Date | null {
        if ([year, month, day].some((param) => typeof param !== "number") || year < 1861) {
            return null;
        }
        const date = moment(Date.UTC(year, month, day));
        if (!date.isValid() || date.year() !== year || date.month() !== month || date.date() !== day) {
            return null;
        }
        return date.toDate();
    }

    /**
     * Parse a Dated and Gender information to create Date/Gender CF part
     * @param date Date or Moment instance, ISO8601 date string or array of numbers [year, month, day]
     * @returns Parsed Date or null if not valid
     */
    public static parseDate(date: MultiFormatDate): Date | null {
        if (!(
            date instanceof Date ||
            date instanceof moment ||
            typeof date === "string" && new RegExp(ISO8601_SHORT_DATE).test(date) ||
            Array.isArray(date) && !date.some((value) => typeof value !== "number")
        )) {
            return null;
        }

        const parsedDate = moment(date);

        return parsedDate.isValid() ? parsedDate.toDate() : null;
    }

    /**
     * Parse a Dated and Gender information to create Date/Gender CF part
     * @param date Date or Moment instance, ISO8601 date string or array of numbers [year, month, day]
     * @param gender Gender enum value
     * @returns Birth date and Gender CF code
     */
    public static dateGenderToCf(date: MultiFormatDate, gender: Genders): string | null {
        const parsedDate = this.parseDate(date);
        if (!parsedDate) {
            return null;
        }

        const cfYear = this.yearToCf(parsedDate.getFullYear());
        const cfMonth = this.monthToCf(parsedDate.getMonth());
        const cfDayGender = this.dayGenderToCf(parsedDate.getDate(), gender);

        return `${cfYear}${cfMonth}${cfDayGender}`;
    }

    /**
     * Parse place name and province to Belfiore code
     * @param cityOrCountryName City or Country name
     * @param provinceId Province code for cities
     * @returns Matching place belfiore code, if only once is matching criteria
     */
    /**
     * Parse a Date and Gender information to create Date/Gender CF part
     * @param birthDate Date or Moment instance, ISO8601 date string or array of numbers [year, month, day]
     * @param cityOrCountryName City or Country name
     * @param provinceId Province code for cities
     * @returns Matching place belfiore code, if only once is matching criteria
     */
    public static placeToCf(cityOrCountryName: string, provinceId?: string): string | null;
    public static placeToCf(birthDate: MultiFormatDate, cityOrCountryName: string, provinceId?: string): string | null;
    public static placeToCf(dateOrName: MultiFormatDate, nameOrProvince?: string, provinceId?: string): string | null {
        const birthDate: Date | null = this.parseDate(dateOrName);
        let name: string;
        let province: string;
        if (!birthDate && typeof dateOrName === "string") {
            name = dateOrName;
            province = nameOrProvince;
        } else {
            name = nameOrProvince;
            province = provinceId;
        }
        if (!name) {
            throw new Error("placeToCf accepts only (string, [string]) or (string | Date | Moment, string, [string])");
        }

        let placeFinder: BelfioreConnector = Belfiore;
        if (province) {
            placeFinder = placeFinder.byProvince(province);
        }
        if (birthDate) {
            placeFinder = placeFinder.active(birthDate);
        }
        const foundPlace: BelfiorePlace = placeFinder.findByName(name);
        if (foundPlace) {
            return foundPlace.belfioreCode;
        }
        return null;
    }

    /**
     * Generates full CF
     * @returns Complete CF
     */
    public static encodeCf({
        surname,
        name,

        year,
        month,
        day,
        date,

        gender,
        place,
    }: IPersonalInfo): string | null {
        const dtParams = this.parseDate(date) || this.yearMonthDayToDate(year, month, day);
        const generator = [
            () => this.surnameToCf(surname),
            () => this.nameToCf(name),
            () => this.dateGenderToCf(dtParams, gender),
            () => this.placeToCf(dtParams, place),
            () => CheckDigitizer.checkDigit(cf),
        ];
        let cf = "";
        for (const cfPartGenerator of generator) {
            const cfValue = cfPartGenerator();
            if (!cfValue) {
                return null;
            }
            cf += cfValue;
        }

        return cf;
    }

    private static JOLLY_CHAR: string = "*";

    /**
     * Default omocode bitmap
     */
    private static OMOCODE_BITMAP: number = 0b0111011011000000;

    private static checkBitmap(offset: number): boolean {
        // tslint:disable-next-line: no-bitwise
        return !!( 2 ** offset & this.OMOCODE_BITMAP);
    }

    private static charOmocode(char: string, offset: number): string {
        if ((/^[A-Z]$/giu).test(char) && this.checkBitmap(offset)) {
            return Omocodes[char];
        }

        return char;
    }

    private static charExtractor(text: string, CHAR_LIST: string): string {
        const charMatcher = new RegExp(`[${CHAR_LIST}]+`, "ig");
        const diacriticFreeText = diacriticRemover.replace(text).trim();
        const matchingChars = diacriticFreeText.match(charMatcher);
        return (matchingChars || []).join("");
    }
}