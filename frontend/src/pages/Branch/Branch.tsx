import { Formik, Form, Field, useFormikContext } from "formik";
import { useEffect, useMemo, useState } from "react";
import { Plus, RotateCcw } from "lucide-react";
import type { AxiosResponse } from "axios";
import type { IBranchModel, IBranchRequestModel, IBranchResponseModel } from "@/models/Branch";
import type { ApiResponseModel } from "@/services/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from '@/components/formik-fields/Input';
import { Select } from '@/components/formik-fields/Select';
import { Button } from '@/components/Button';
import branchService from "@/services/branch-service";
import { useDebounce } from "@/hook/useDebounce";
import CustomTable, { type TableColumn } from "@/components/CustomTable";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import AddBranchForm from "./AddBranchForm";

const statusOptions = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
];

const column: TableColumn<IBranchModel>[] = [
    // Running number (1, 2, 3 ... continuing across pages), not the database id
    { id: "srNo", label: "Sr no.", renderCell: (_value, _row, _column, _rowIndex, serialNo) => serialNo },
    { id: "name", label: "Name", sortable: true },
    { id: "address", label: "Address" },
    {
        id: "status",
        label: "Status",
        accessor: (row) => row.isActive,
        renderCell: (isActive: boolean) => (isActive ? "Active" : "Inactive"),
    },
    { id: "actions", label: "Actions" },
];

// The fetcher resolves to the full axios response: { data: { status, message, data: { branch, pagination } } }.
// Rows live in data.data.branch; total/totalPages are picked up from pagination automatically.
const mapResponseToColumns = (response: AxiosResponse<ApiResponseModel<IBranchResponseModel>>): IBranchModel[] =>
    response.data.data.branch;

type BranchFilterValues = Pick<IBranchRequestModel, "search" | "status">;

// Reports filter changes to the parent, debouncing the search text
const BranchFilterWatcher = ({ onChange }: { onChange: (filters: BranchFilterValues) => void }) => {
    const { values } = useFormikContext<BranchFilterValues>();
    const search = useDebounce(values.search?.trim() ?? "");
    const status = values.status;

    useEffect(() => {
        onChange({ search, status });
    }, [search, status, onChange]);

    return null;
};

const Branch = () => {

    const [filters, setFilters] = useState<BranchFilterValues>({ search: "", status: "" });
    // branch is null when adding, set when editing
    const [form, setForm] = useState<{ open: boolean; branch: IBranchModel | null }>({ open: false, branch: null });
    const [branchToDelete, setBranchToDelete] = useState<IBranchModel | null>(null);
    // Bumped after a branch is saved or deleted so the table reloads
    const [refreshKey, setRefreshKey] = useState(0);
    const reloadTable = () => setRefreshKey((key) => key + 1);

    // Delete flow: trash icon -> onDelete sets branchToDelete -> ConfirmDialog opens ->
    // "Delete" calls removeBranch -> branchService.deleteBranch -> DELETE /api/branch/:id
    const { mutate: removeBranch, isPending: isDeleting } = useMutation({
        mutationFn: (id: number) => branchService.deleteBranch(id),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Branch deleted successfully");
                setBranchToDelete(null);
                reloadTable();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    // Keyed on filter values, so identical filters (StrictMode remount, same search) don't refetch
    const { isFetching: isBranchPending } = useQuery({
        queryKey: ["branches", filters],
        queryFn: () => branchService.branch({ page: 1, pageSize: 10, ...filters }),
        select: (response) => response.data,
    });


    const initialValues = useMemo<BranchFilterValues>(() => ({
        search: "",
        status: "",
    }), []);

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <Formik initialValues={initialValues} onSubmit={(values) => console.log(values)}>
                {({ resetForm }) => (
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <Form className="flex flex-col gap-3 sm:flex-row sm:items-center" noValidate>
                            <BranchFilterWatcher onChange={setFilters} />
                            <div className="w-full sm:w-72">
                                <Field
                                    id="search"
                                    name="search"
                                    placeholder="Search branches..."
                                    component={Input}
                                />
                            </div>
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
                                disabled={isBranchPending}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                <RotateCcw className="size-4" />
                                Reset
                            </Button>
                        </Form>
                        <Button className="md:w-auto" onClick={() => setForm({ open: true, branch: null })}>
                            <Plus className="size-4" />
                            Add Branch
                        </Button>
                    </div>
                )}
            </Formik>

            {/* Filters are part of the key so changing them refetches the table */}
            <CustomTable<IBranchModel>
                column={column}
                queryKey={`branches:${JSON.stringify(filters)}`}
                row={(page: number, limit: number) => branchService.branch({ page, pageSize: limit, ...filters })}
                mapResponseToColumns={mapResponseToColumns}
                refreshKey={refreshKey}
                isEdit
                onEdit={(branch) => setForm({ open: true, branch })}
                isDelete
                onDelete={setBranchToDelete}
            />

            <AddBranchForm
                open={form.open}
                branch={form.branch}
                onClose={() => setForm({ open: false, branch: null })}
                onSaved={reloadTable}
            />

            <ConfirmDialog
                open={!!branchToDelete}
                onClose={() => setBranchToDelete(null)}
                onConfirm={() => branchToDelete && removeBranch(branchToDelete.id)}
                loading={isDeleting}
                title="Delete Branch"
                message={
                    <>
                        Are you sure you want to permanently delete <span className="font-semibold text-gray-900">{branchToDelete?.name}</span>? This cannot be undone.
                    </>
                }
            />
        </div>
    );
}

export default Branch;
