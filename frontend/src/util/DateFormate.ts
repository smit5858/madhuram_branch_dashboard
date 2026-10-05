import moment from 'moment';

export const DateToDateStringWithDay = (date: Date | string | number) => moment(date).format('DD-MMM-yyyy(dddd)'); // Outputs: "02-Dec-2022(Friday)"
export const DateToDateString = (date: Date | string) => moment(date).format('DD-MMM-yyyy'); // Outputs: "02-Dec-2022"
export const DateToTimeString = (date: Date | string) => moment(date).format('HH:mm:ss');// Outputs: "14:30:15"
export const DateToDateTimeString = (date: Date | string) => moment(date).format('DD-MMM-yyyy, HH:mm:ss'); // Outputs: "02-Dec-2022 14:30:15"
export const TimeToTimeString = (time: string | number) => moment(time, 'hh:mm').format('hh:mm '); // Outputs: "02:30"
export const DateToLocalDateString = (date: string | Date) => moment(date).format('YYYY-MM-DD');
export const DateToDateStringWithMonth = (date: Date | string | any) => moment(date).format('DD/MM/YYYY');

