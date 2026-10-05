import { Formik, Form, Field, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { AxiosResponse } from "axios";
import type { IEmployeeModel, IEmployeeRequestModel, IEmployeeResponseModel } from "@/models/Employee";
import type { ApiResponseModel } from "@/services/api";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from '@/components/formik-fields/Input';
import { Select, type SelectOption } from '@/components/formik-fields/Select';
import { Button } from '@/components/Button';
import employeeService from "@/services/employee-service";
import { useDebounce } from "@/hook/useDebounce";
import { useBranchOptions } from "@/hook/useBranchOptions";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import AddEmployeeForm from "./AddEmployeeForm";

const statusOptions = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
];

const column: TableColumn<IEmployeeModel>[] = [
    // Running number (1, 2, 3 ... continuing across pages), not the database id
    { id: "srNo", label: "Sr no.", renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "name", label: "Name", sortable: true },
    { id: "email", label: "Email" },
    { id: "phone", label: "Phone", renderCell: (phone: string | null) => phone || "-" },
    {
        id: "branch",
        label: "Branch",
        sortable: true,
        accessor: (row) => row.Branch?.name ?? "",
        renderCell: (name: string) => name || <span className="text-gray-400">Unassigned</span>,
    },
    { id: "role", label: "Role", accessor: (row) => row.Role?.name ?? "-" },
    {
        id: "status",
        label: "Status",
        accessor: (row) => row.isActive,
        renderCell: (isActive: boolean) => (isActive ? "Active" : "Inactive"),
    },
    { id: "actions", label: "Actions" },
];

// The fetcher resolves to the full axios response: { data: { status, message, data: { employee, pagination } } }.
// Rows live in data.data.employee; total/totalPages are picked up from pagination automatically.
const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<IEmployeeResponseModel>>): IEmployeeModel[] =>
    response.data.data.employee;

type EmployeeFilterValues = Pick<IEmployeeRequestModel, "search" | "status" | "branchId">;

// Reports filter changes to the parent, debouncing the search text
const EmployeeFilterWatcher = ({ onChange }: { onChange: (filters: EmployeeFilterValues) => void }) => {
    const { values } = useFormikContext<EmployeeFilterValues>();
    const search = useDebounce(values.search?.trim() ?? "");
    const status = values.status;
    const branchId = values.branchId;

    useEffect(() => {
        onChange({ search, status, branchId });
    }, [search, status, branchId, onChange]);

    return null;
};

const Employee = () => {

    const [filters, setFilters] = useState<EmployeeFilterValues>({ search: "", status: "", branchId: "" });
    // employee is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; employee: IEmployeeModel | null }>({ open: false, employee: null });
    const [employeeToDelete, setEmployeeToDelete] = useState<IEmployeeModel | null>(null);
    // Bumped after an employee is saved or deleted so the table reloads
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    const { branches, isLoading: isBranchLoading } = useBranchOptions();
    const branchFilterOptions = useMemo<SelectOption[]>(() => [
        { value: "", label: "All branches" },
        ...branches.map((b) => ({ value: String(b.id), label: b.name })),
    ], [branches]);

    const { mutate: removeEmployee, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => employeeService.deleteEmployee(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Employee deleted successfully");
                setEmployeeToDelete(null);
                reloadTable();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    const initialValues = useMemo<EmployeeFilterValues>(() => ({
        search: "",
        status: "",
        branchId: "",
    }), []);

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <Formik initialValues={initialValues} onSubmit={() => undefined}>
                {({ resetForm }) => (
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" noValidate>
                            <EmployeeFilterWatcher onChange={setFilters} />
                            <div className="w-full sm:w-72">
                                <Field
                                    id="search"
                                    name="search"
                                    placeholder="Search name, email, phone..."
                                    component={Input}
                                />
                            </div>
                            <Field
                                id="branchId"
                                name="branchId"
                                options={branchFilterOptions}
                                placeholder={isBranchLoading ? "Loading branches..." : "Select branch"}
                                component={Select}
                                className="w-full sm:w-48"
                            />
                            <Field
                                id="status"
                                name="status"
                                options={statusOptions}
                                placeholder="Select status"
                                component={Select}
                                className="w-full sm:w-44"
                            />
                            <Button
                                onClick={() => resetForm()}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        <Button className="lg:w-auto" onClick={() => setForm({ open: true, employee: null })}>
                            <Plus className="size-4" />
                            Add Employee
                        </Button>
                    </div>
                )}
            </Formik>

            {/* Filters are part of the key so changing them refetches the table */}
            <CustomTable<IEmployeeModel>
                column={column}
                queryKey={`employees:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => employeeService.employee({ page, pageSize: limit, ...filters })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                emptyMessage="No employees found"
                isEdit
                onEdit={(employee) => setForm({ open: true, employee })}
                isDelete
                onDelete={setEmployeeToDelete}
            />

            <AddEmployeeForm
                open={form.open}
                employee={form.employee}
                onClose={() => setForm({ open: false, employee: null })}
                onSaved={reloadTable}
            />

            <ConfirmDialog
                open={!!employeeToDelete}
                onClose={() => setEmployeeToDelete(null)}
                onConfirm={() => employeeToDelete && removeEmployee(employeeToDelete.id)}
                loading={isDeleting}
                title="Delete Employee"
                message={
                    <>
                        Are you sure you want to permanently delete <span className="font-semibold text-gray-900">{employeeToDelete?.name}</span>? This cannot be undone.
                    </>
                }
            />
        </div>
    );
}

export default Employee;
