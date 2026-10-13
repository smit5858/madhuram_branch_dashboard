import { parsePhoneNumberFromString } from "libphonenumber-js";

export const getBaseURL = (url: string) => {
    return url + "/";
};

/** "+919876543210" -> "+91 98765 43210"; anything unparseable is shown as stored */
export const formatPhone = (phone?: string | null) => {
    if (!phone) return "";
    const parsed = parsePhoneNumberFromString(phone);
    return parsed ? parsed.formatInternational() : phone;
};
