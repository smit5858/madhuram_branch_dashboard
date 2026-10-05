import { Field, Form, Formik } from "formik";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Switch } from "@/components/formik-fields/Switch";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import branchService from "@/services/branch-service";
import { branchSchema } from "@/validation/validation";
import type { IBranchCreateModel, IBranchModel } from "@/models/Branch";

const emptyValues: IBranchCreateModel = { name: "", isActive: true, address: "" };

interface AddBranchFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** When set the form edits this branch, otherwise it creates a new one. */
    branch?: IBranchModel | null;
}

const AddBranchForm = ({ open, onClose, onSaved, branch }: AddBranchFormProps) => {
    const isEdit = !!branch;

    const initialValues: IBranchCreateModel = branch
        ? { name: branch.name, address: branch.address ?? "", isActive: branch.isActive }
        : emptyValues;

    const { mutate: saveBranch, isPending } = useMutation({
        mutationFn: (values: IBranchCreateModel) =>
            branch ? branchService.updateBranch(branch.id, values) : branchService.createBranch(values),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || (isEdit ? "Branch updated successfully" : "Branch created successfully"));
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Branch" : "Add Branch"} preventClose={isPending}>
            <Formik
                initialValues={initialValues}
                validationSchema={branchSchema}
                onSubmit={(values) =>
                    saveBranch({
                        name: values.name.trim(),
                        address: values.address.trim(),
                        isActive: values.isActive,
                    })
                }
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <Field
                        id="name"
                        name="name"
                        label="Name"
                        placeholder="Enter branch name"
                        component={Input}
                        autoFocus
                    />
                    <Field
                        id="address"
                        name="address"
                        label="Address"
                        placeholder="Enter branch address"
                        component={Input}
                    />
                    <Field
                        id="isActive"
                        name="isActive"
                        label="Status"
                        onLabel="Active"
                        offLabel="Inactive"
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
                            {isEdit ? "Update Branch" : "Save Branch"}
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddBranchForm;
