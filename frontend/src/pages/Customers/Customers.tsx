import { Formik, Form, Field, useFormikContext } from "formik";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import type { AxiosResponse } from "axios";
import type { ICustomerModel, ICustomerResponseModel } from "@/models/Customer";
import type { ApiResponseModel } from "@/services/api";
import type { RootState } from "@/store/store";
import { Input } from "@/components/formik-fields/Input";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import customerService from "@/services/customer-service";
import { useDebounce } from "@/hook/useDebounce";
import { formatPhone } from "@/util/CommonFunction";
import AddCustomerForm from "./AddCustomerForm";
import CustomerDetailsDialog from "./CustomerDetailsDialog";

const column: TableColumn<ICustomerModel>[] = [
    // Running number (1, 2, 3 ... continuing across pages), not the database id
    { id: "srNo", label: "Sr. No.", width: 80, renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "name", label: "Customer Name", sortable: true, className: "min-w-44" },
    { id: "phone", label: "Phone Number", className: "whitespace-nowrap", renderCell: (phone: string | null) => formatPhone(phone) || "—" },
    { id: "email", label: "Email Address", renderCell: (email: string | null) => email || "—" },
    { id: "companyName", label: "Company / Shop / Garage Name", sortable: true, className: "min-w-44", renderCell: (name: string | null) => name || "—" },
    { id: "city", label: "City", sortable: true, renderCell: (city: string | null) => city || "—" },
    { id: "pincode", label: "Pincode", renderCell: (pincode: string | null) => pincode || "—" },
    { id: "actions", label: "Action", width: 120 },
];

// The fetcher resolves to the full axios response: { data: { status, message, data: { customer, pagination } } }.
// Rows live in data.data.customer; total/totalPages are picked up from pagination automatically.
const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<ICustomerResponseModel>>): ICustomerModel[] =>
    response.data.data.customer;

// Reports the debounced search text to the parent
const CustomerSearchWatcher = ({ onChange }: { onChange: (search: string) => void }) => {
    const { values } = useFormikContext<{ search: string }>();
    const search = useDebounce(values.search.trim());

    useEffect(() => {
        onChange(search);
    }, [search, onChange]);

    return null;
};

const Customers = () => {
    const { userId, role } = useSelector((state: RootState) => state.auth);
    // Deleting a customer affects every branch, so only admins get the option (the API checks too)
    const isAdmin = (role ?? "").toLowerCase() === "admin";
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    // customer is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; customer: ICustomerModel | null }>({ open: false, customer: null });
    const [customerToView, setCustomerToView] = useState<ICustomerModel | null>(null);
    const [customerToDelete, setCustomerToDelete] = useState<ICustomerModel | null>(null);
    // Bumped after a customer is saved or deleted so the table reloads
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => {
        setRefreshKey((key) => key + 1);
        // Keep the sale form's suggestions in step with the list
        queryClient.invalidateQueries({ queryKey: ["customer-suggest"] });
        queryClient.invalidateQueries({ queryKey: ["customer"] });
    };

    const { mutate: removeCustomer, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => customerService.deleteCustomer(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Customer deleted successfully");
                setCustomerToDelete(null);
                reloadTable();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <Formik initialValues={{ search: "" }} onSubmit={() => undefined}>
                {({ resetForm }) => (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:items-center" noValidate>
                            <CustomerSearchWatcher onChange={setSearch} />
                            <div className="w-full sm:w-80">
                                <Field
                                    id="search"
                                    name="search"
                                    placeholder="Search name, phone, company or city..."
                                    component={Input}
                                />
                            </div>
                            <Button
                                onClick={() => resetForm()}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        <Button className="md:w-auto" onClick={() => setForm({ open: true, customer: null })}>
                            <Plus className="size-4" />
                            Add Customer
                        </Button>
                    </div>
                )}
            </Formik>

            {/* User and search are part of the key so changing them refetches the table */}
            <CustomTable<ICustomerModel>
                column={column}
                queryKey={`customers:${userId}:${search}`}
                row={(page: number, limit: number) => customerService.customer({ page, pageSize: limit, search: search || undefined })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage={search ? "No customers match your search" : "No customers yet. Add one, or they'll be saved automatically with sales."}
                isView
                onView={setCustomerToView}
                isEdit
                onEdit={(customer) => setForm({ open: true, customer })}
                isDelete={isAdmin}
                onDelete={setCustomerToDelete}
            />

            <AddCustomerForm
                open={form.open}
                customer={form.customer}
                onClose={() => setForm({ open: false, customer: null })}
                onSaved={reloadTable}
            />

            <CustomerDetailsDialog
                customer={customerToView}
                isAdmin={isAdmin}
                onClose={() => setCustomerToView(null)}
                onEdit={(customer) => {
                    setCustomerToView(null);
                    setForm({ open: true, customer });
                }}
            />

            <ConfirmDialog
                open={!!customerToDelete}
                onClose={() => setCustomerToDelete(null)}
                onConfirm={() => customerToDelete && removeCustomer(customerToDelete.id)}
                loading={isDeleting}
                title="Delete Customer"
                message={
                    <>
                        Are you sure you want to permanently delete <span className="font-semibold text-gray-900">{customerToDelete?.name}</span>? Their sales will be kept with the customer's name and phone number. This cannot be undone.
                    </>
                }
            />
        </div>
    );
};

export default Customers;
