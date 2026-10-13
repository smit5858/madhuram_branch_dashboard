import { Field, useField, useFormikContext } from "formik";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useSelector } from "react-redux";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isValidPhoneNumber } from "libphonenumber-js";
import { Building2, ChevronDown, ChevronUp, CircleAlert, Mail, MapPin, UserRound, UserRoundCheck } from "lucide-react";
import clsx from "clsx";
import { Input } from "@/components/formik-fields/Input";
import { PhoneInput } from "@/components/formik-fields/PhoneInput";
import customerService from "@/services/customer-service";
import { useDebounce } from "@/hook/useDebounce";
import { formatPhone } from "@/util/CommonFunction";
import type { RootState } from "@/store/store";
import type { ICustomerModel } from "@/models/Customer";
import type { ISaleFormValues } from "@/models/Sale";

const MIN_SEARCH = 2;

// Same comparison the API uses to decide a typed name is the saved customer's
const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

const describe = (c: ICustomerModel) => [c.companyName, c.city].filter(Boolean).join(" · ");

const useCustomerSuggestions = (search: string, enabled: boolean) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    return useQuery({
        queryKey: ["customer-suggest", userId, search],
        queryFn: async () => {
            const response = await customerService.suggestCustomers(search);
            if (!response?.data?.status) throw new Error("Could not load customers.");
            // The API returns each customer once; guard anyway so a row never shows twice
            return [...new Map(response.data.data.customer.map((c) => [c.id, c])).values()];
        },
        enabled: enabled && search.length >= MIN_SEARCH,
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        retry: false,
    });
};

// Picking a customer copies their name and phone into the sale. A customer saved without a
// phone keeps whatever phone was already typed, since the sale still needs one.
const usePickCustomer = () => {
    const { values, setValues, setFieldTouched } = useFormikContext<ISaleFormValues>();
    return (customer: ICustomerModel) => {
        setValues({
            ...values,
            customer,
            customerName: customer.name,
            customerPhone: customer.phone ?? values.customerPhone,
        }, true);
        setFieldTouched("customerName", true, false);
    };
};

type SearchStatus = "error" | "searching" | "none" | null;

// Dropdown of saved customers for a field: typing searches (debounced), arrows move, Enter or
// a click picks, Escape / Tab / blur close. Shared by the name and phone fields.
const useCustomerAutocomplete = (text: string, minLength: number) => {
    const pick = usePickCustomer();
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();

    const search = useDebounce(text, 250);
    const { data: suggestions = [], isFetching, isError } = useCustomerSuggestions(search, open && search.length >= minLength);
    const searching = open && text.length >= minLength;
    // Earlier matches stay listed while the next search loads
    const items = searching ? suggestions : [];
    const shown = items.length > 0;
    // Without matches there is no floating list (it would cover the next field), just a line of help
    const status: SearchStatus = !searching || shown ? null
        : isError ? "error"
        : isFetching || search !== text ? "searching"
        : "none";

    useEffect(() => {
        if (shown && active >= 0) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [shown, active]);

    const choose = (customer: ICustomerModel) => {
        pick(customer);
        setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return setOpen(true);
            if (items.length === 0) return;
            const dir = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i === -1 ? (dir === 1 ? 0 : items.length - 1) : (i + dir + items.length) % items.length));
        } else if (e.key === "Enter" && shown && active >= 0 && items[active]) {
            // Picks the highlighted customer instead of submitting the sale
            e.preventDefault();
            choose(items[active]);
        } else if (e.key === "Escape" && shown) {
            // Closes the list without closing the dialog
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
        } else if (e.key === "Tab") {
            setOpen(false);
        }
    };

    return {
        status,
        /** Call on every edit: new text means new suggestions, so nothing is highlighted yet */
        onType: () => {
            setActive(-1);
            setOpen(true);
        },
        onFocus: () => setOpen(true),
        onClose: () => setOpen(false),
        onKeyDown,
        ariaProps: {
            role: "combobox",
            "aria-autocomplete": "list" as const,
            "aria-expanded": shown,
            "aria-controls": listId,
            "aria-activedescendant": shown && active >= 0 ? `${listId}-${active}` : undefined,
        },
        list: shown && (
            <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label="Saved customers"
                // Keeps focus in the input so a click doesn't blur and close the list first
                onMouseDown={(e) => e.preventDefault()}
                className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            >
                {items.map((c, i) => (
                    <li
                        key={c.id}
                        id={`${listId}-${i}`}
                        data-index={i}
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => choose(c)}
                        className={clsx("flex cursor-pointer items-start gap-3 px-3 py-2", i === active ? "bg-blue-50" : "hover:bg-slate-50")}
                    >
                        <UserRound className="mt-0.5 size-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                <span className="truncate text-sm font-medium text-gray-900">{c.name}</span>
                                {c.phone && <span className="text-xs tabular-nums text-slate-600">{formatPhone(c.phone)}</span>}
                            </div>
                            {describe(c) && <p className="truncate text-xs text-slate-500">{describe(c)}</p>}
                        </div>
                    </li>
                ))}
            </ul>
        ),
    };
};

const StatusLine = ({ status, noneText }: { status: SearchStatus; noneText: string }) =>
    status && (
        <p className={clsx("mt-1.5 px-1 text-xs", status === "error" ? "text-red-500" : "text-slate-500")} aria-live="polite">
            {status === "error"
                ? "Couldn't load saved customers. You can still enter the details below."
                : status === "searching" ? "Searching saved customers..." : noneText}
        </p>
    );

// Customer name field that suggests saved customers matching the typed name or phone number
const CustomerNameAutocomplete = ({ autoFocus, inputRef }: { autoFocus?: boolean; inputRef: RefObject<HTMLInputElement | null> }) => {
    const [field, meta] = useField<string>("customerName");
    const auto = useCustomerAutocomplete(field.value.trim(), MIN_SEARCH);

    return (
        <div className="relative">
            <Input
                {...field}
                {...auto.ariaProps}
                ref={inputRef}
                id="customerName"
                label="Customer Name"
                placeholder="Search by name or phone, or enter a new customer"
                autoComplete="off"
                autoFocus={autoFocus}
                error={meta.touched ? meta.error : undefined}
                onChange={(e) => {
                    field.onChange(e);
                    auto.onType();
                }}
                onFocus={auto.onFocus}
                onBlur={(e) => {
                    field.onBlur(e);
                    auto.onClose();
                }}
                onKeyDown={auto.onKeyDown}
            />
            <StatusLine status={auto.status} noneText="No saved customer matches. A new customer will be saved with this sale." />
            {auto.list}
        </div>
    );
};

// At least 3 digits after the country code before searching, e.g. "+91987"
const MIN_PHONE_SEARCH = 6;

// Phone field that suggests saved customers whose number contains the digits typed so far
const CustomerPhoneAutocomplete = () => {
    const { values } = useFormikContext<ISaleFormValues>();
    const phone = values.customerPhone;
    const auto = useCustomerAutocomplete(phone, MIN_PHONE_SEARCH);

    return (
        <div className="relative">
            <Field
                id="customerPhone"
                name="customerPhone"
                label="Customer Phone Number"
                placeholder="Enter phone number"
                component={PhoneInput}
                // PhoneInput writes to Formik itself; this only tells the list the number changed
                onChange={auto.onType}
                inputProps={{ ...auto.ariaProps, autoComplete: "off" }}
                onFocus={auto.onFocus}
                onBlur={auto.onClose}
                onKeyDown={auto.onKeyDown}
            />
            {/* No "no match" note here: a number nobody has yet is the normal new-customer case */}
            <StatusLine status={auto.status === "none" ? null : auto.status} noneText="" />
            {auto.list}
        </div>
    );
};

// When the typed phone number already belongs to a saved customer, offers to use them so the
// sale doesn't fail as a duplicate (or quietly attach to the wrong person)
const PhoneMatchNotice = () => {
    const { values } = useFormikContext<ISaleFormValues>();
    const pick = usePickCustomer();
    const phone = values.customerPhone;
    const valid = !!phone && isValidPhoneNumber(phone);
    const { data: matches = [] } = useCustomerSuggestions(phone, valid);
    const match = valid ? matches.find((c) => c.phone === phone) : undefined;
    if (!match) return null;

    const same = sameName(match.name, values.customerName);
    return (
        <div className={clsx("flex flex-col gap-2 rounded-xl px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between", same ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800")}>
            <span className="flex items-start gap-2">
                <CircleAlert className="mt-px size-4 shrink-0" />
                <span>
                    {same ? "Saved customer found: " : "This phone number is already saved for "}
                    <span className="font-semibold">{match.name}</span>
                    {describe(match) && <> ({describe(match)})</>}.
                    {same ? " This sale will be linked to them." : " Use that customer, or enter a different number."}
                </span>
            </span>
            <button
                type="button"
                onClick={() => pick(match)}
                className="shrink-0 rounded-lg bg-white px-2.5 py-1 font-medium shadow-sm hover:bg-slate-50"
            >
                Use this customer
            </button>
        </div>
    );
};

const SelectedCustomerCard = ({ customer, onChange }: { customer: ICustomerModel; onChange: () => void }) => {
    const location = [customer.address, customer.city, customer.pincode].filter(Boolean).join(", ");
    return (
        <div className="flex items-start gap-3 rounded-xl bg-gray-100 px-3 py-3">
            <UserRoundCheck className="mt-0.5 size-5 shrink-0 text-blue-500" />
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-600">Customer</p>
                <p className="truncate text-sm font-semibold text-gray-900">{customer.name}</p>
                <div className="mt-1 flex flex-col gap-0.5 text-xs text-slate-600">
                    {customer.phone && <span className="tabular-nums">{formatPhone(customer.phone)}</span>}
                    {customer.companyName && <span className="flex items-center gap-1.5"><Building2 className="size-3.5 shrink-0" />{customer.companyName}</span>}
                    {customer.email && <span className="flex items-center gap-1.5 break-all"><Mail className="size-3.5 shrink-0" />{customer.email}</span>}
                    {location && <span className="flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0" />{location}</span>}
                </div>
            </div>
            <button
                type="button"
                onClick={onChange}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
                Change
            </button>
        </div>
    );
};

const hasDetails = (v: ISaleFormValues) =>
    !!(v.customerEmail || v.customerAddress || v.customerPincode || v.customerCity);

/** Customer part of the sale form: pick a saved customer, or enter a new one's details */
const SaleCustomerFields = ({ autoFocus }: { autoFocus?: boolean }) => {
    const { values, setValues, setTouched, touched } = useFormikContext<ISaleFormValues>();
    const nameRef = useRef<HTMLInputElement>(null);
    const [showMore, setShowMore] = useState(() => hasDetails(values));
    const { customer } = values;

    // Filled-in details always stay visible, so a hidden field can never block saving
    const filled = hasDetails(values);
    const detailsVisible = showMore || filled;

    const clearCustomer = () => {
        setValues({
            ...values,
            customer: null,
            customerName: "",
            customerPhone: "",
            customerEmail: "",
            customerAddress: "",
            customerPincode: "",
            customerCity: "",
            customerCompany: "",
        }, false);
        setTouched({ ...touched, customerName: false, customerPhone: false }, false);
        // Focus once the manual fields are back on screen
        setTimeout(() => nameRef.current?.focus(), 0);
    };

    if (customer) {
        return (
            <div className="flex flex-col gap-3">
                <SelectedCustomerCard customer={customer} onChange={clearCustomer} />
                {/* The sale needs a phone number; it is saved to this customer too */}
                {!customer.phone && (
                    <div className="flex flex-col gap-1">
                        <Field
                            id="customerPhone"
                            name="customerPhone"
                            label="Customer Phone Number"
                            placeholder="Enter phone number"
                            component={PhoneInput}
                        />
                        <p className="px-1 text-xs text-slate-500">This customer has no phone number yet. It will be saved to their record.</p>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            <CustomerNameAutocomplete autoFocus={autoFocus} inputRef={nameRef} />
            <div className="grid gap-4 sm:grid-cols-2">
                <CustomerPhoneAutocomplete />
                <Field
                    id="customerCompany"
                    name="customerCompany"
                    label="Company / Shop / Garage (optional)"
                    placeholder="Enter company name"
                    component={Input}
                />
            </div>
            <PhoneMatchNotice />
            {!filled && (
                <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    aria-expanded={detailsVisible}
                    className="flex items-center gap-1 self-start px-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                    {detailsVisible ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    {detailsVisible ? "Hide" : "Add"} email, address, city & pincode (optional)
                </button>
            )}
            {detailsVisible && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="customerEmail" name="customerEmail" type="email" label="Email (optional)" placeholder="Enter email address" component={Input} />
                        <Field id="customerCity" name="customerCity" label="City (optional)" placeholder="Enter city" component={Input} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
                        <Field id="customerAddress" name="customerAddress" label="Address (optional)" placeholder="Enter address" component={Input} />
                        <Field id="customerPincode" name="customerPincode" label="Pincode (optional)" placeholder="6 digits" inputMode="numeric" maxLength={6} component={Input} />
                    </div>
                </>
            )}
            <p className="-mt-1 px-1 text-xs text-slate-500">New customers are saved automatically when the sale is saved.</p>
        </div>
    );
};

export default SaleCustomerFields;
