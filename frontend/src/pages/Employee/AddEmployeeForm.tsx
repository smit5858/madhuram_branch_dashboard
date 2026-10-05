import { Field, Form, Formik } from "formik";
import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { PasswordInput } from "@/components/formik-fields/PasswordInput";
import { PhoneInput } from "@/components/formik-fields/PhoneInput";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Switch } from "@/components/formik-fields/Switch";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import employeeService from "@/services/employee-service";
import roleService from "@/services/role-service";
import { useBranchOptions } from "@/hook/useBranchOptions";
import { employeeSchema } from "@/validation/validation";
import type { IEmployeeFormValues, IEmployeeModel } from "@/models/Employee";
import type { RootState } from "@/store/store";

const emptyValues: IEmployeeFormValues = {
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: "",
    branchId: "",
    isActive: true,
};

interface AddEmployeeFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** When set the form edits this employee, otherwise it creates a new one. */
    employee?: IEmployeeModel | null;
}

const AddEmployeeForm = ({ open, onClose, onSaved, employee }: AddEmployeeFormProps) => {
    const isEdit = !!employee;
    const currentUserId = useSelector((state: RootState) => state.auth.userId);
    // Admins can't deactivate themselves or change their own role (the API refuses it too)
    const isSelf = isEdit && String(employee.id) === String(currentUserId);

    const { branches, isLoading: isBranchLoading } = useBranchOptions();

    const { data: roles = [], isFetching: isRoleLoading } = useQuery({
        queryKey: ["role-options"],
        queryFn: () => roleService.role(),
        select: (response) => response?.data?.data?.role ?? [],
        enabled: open,
    });

    // Only active branches can be picked; an employee already on an inactive branch keeps it listed
    const branchOptions = useMemo<SelectOption[]>(() => branches
        .filter((b) => b.isActive || b.id === employee?.branchId)
        .map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    [branches, employee?.branchId]);

    const currentRole = employee?.Role ?? null;
    const roleOptions = useMemo<SelectOption[]>(() => {
        const options = roles.map((r) => ({ value: String(r.id), label: r.name }));
        // Keep the employee's current role visible even if it was deactivated since
        if (currentRole && !options.some((o) => o.value === String(currentRole.id))) {
            options.push({ value: String(currentRole.id), label: `${currentRole.name} (Inactive)` });
        }
        return options;
    }, [roles, currentRole]);

    const initialValues: IEmployeeFormValues = employee
        ? {
            name: employee.name,
            email: employee.email,
            phone: employee.phone ?? "",
            password: "",
            roleId: employee.roleId ? String(employee.roleId) : "",
            branchId: employee.branchId ? String(employee.branchId) : "",
            isActive: employee.isActive,
        }
        : emptyValues;

    const { mutate: saveEmployee, isPending } = useMutation({
        mutationFn: (values: IEmployeeFormValues) => {
            const body = {
                name: values.name.trim(),
                email: values.email.trim(),
                phone: values.phone,
                password: values.password,
                roleId: Number(values.roleId),
                branchId: Number(values.branchId),
                isActive: values.isActive,
            };
            return employee ? employeeService.updateEmployee(employee.id, body) : employeeService.createEmployee(body);
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || (isEdit ? "Employee updated successfully" : "Employee created successfully"));
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Employee" : "Add Employee"} preventClose={isPending}>
            <Formik
                initialValues={initialValues}
                validationSchema={employeeSchema(isEdit)}
                onSubmit={(values) => saveEmployee(values)}
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <Field
                        id="name"
                        name="name"
                        label="Name"
                        placeholder="Enter employee name"
                        component={Input}
                        autoFocus
                    />
                    <Field
                        id="email"
                        name="email"
                        type="email"
                        label="Email"
                        placeholder="Enter employee email"
                        autoComplete="off"
                        component={Input}
                    />
                    <Field
                        id="phone"
                        name="phone"
                        label="Phone (optional)"
                        placeholder="Enter phone number"
                        component={PhoneInput}
                    />
                    <Field
                        id="password"
                        name="password"
                        label={isEdit ? "New Password" : "Password"}
                        placeholder={isEdit ? "Leave blank to keep current password" : "Enter password"}
                        autoComplete="new-password"
                        component={PasswordInput}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            id="branchId"
                            name="branchId"
                            label="Branch"
                            options={branchOptions}
                            placeholder={isBranchLoading ? "Loading branches..." : "Select branch"}
                            disabled={isBranchLoading && branchOptions.length === 0}
                            component={Select}
                        />
                        <Field
                            id="roleId"
                            name="roleId"
                            label="Role"
                            options={roleOptions}
                            placeholder={isRoleLoading ? "Loading roles..." : "Select role"}
                            disabled={isSelf || (isRoleLoading && roleOptions.length === 0)}
                            component={Select}
                        />
                    </div>
                    {!isBranchLoading && branchOptions.length === 0 && (
                        <p className="-mt-2 text-xs text-red-500">No active branches found. Add a branch first.</p>
                    )}
                    <Field
                        id="isActive"
                        name="isActive"
                        label="Status"
                        onLabel="Active"
                        offLabel="Inactive"
                        disabled={isSelf}
                        component={Switch}
                    />

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">
                            {isEdit ? "Update Employee" : "Save Employee"}
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddEmployeeForm;
