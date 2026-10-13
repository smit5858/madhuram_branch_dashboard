import { Field, Form, Formik } from "formik";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { PhoneInput } from "@/components/formik-fields/PhoneInput";
import { Textarea } from "@/components/formik-fields/Textarea";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import customerService from "@/services/customer-service";
import { customerSchema } from "@/validation/validation";
import type { ICustomerCreateModel, ICustomerModel } from "@/models/Customer";

const emptyValues: ICustomerCreateModel = { name: "", phone: "", email: "", address: "", pincode: "", city: "", companyName: "" };

interface AddCustomerFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** When set the form edits this customer, otherwise it adds one. */
    customer?: ICustomerModel | null;
}

const AddCustomerForm = ({ open, onClose, onSaved, customer }: AddCustomerFormProps) => {
    const isEdit = !!customer;

    const initialValues: ICustomerCreateModel = customer
        ? {
            name: customer.name,
            phone: customer.phone ?? "",
            email: customer.email ?? "",
            address: customer.address ?? "",
            pincode: customer.pincode ?? "",
            city: customer.city ?? "",
            companyName: customer.companyName ?? "",
        }
        : emptyValues;

    const { mutate: saveCustomer, isPending } = useMutation({
        mutationFn: (values: ICustomerCreateModel) =>
            customer ? customerService.updateCustomer(customer.id, values) : customerService.createCustomer(values),
        onSuccess: (response) => {
            // http-service shows its own toast (e.g. a duplicate phone number) and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || (isEdit ? "Customer updated successfully" : "Customer added successfully"));
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog
            open={open}
            onClose={onClose}
            title={isEdit ? "Edit Customer" : "Add Customer"}
            preventClose={isPending}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto!"
        >
            <Formik
                initialValues={initialValues}
                validationSchema={customerSchema}
                onSubmit={(values) =>
                    saveCustomer({
                        name: values.name.trim(),
                        phone: values.phone,
                        email: values.email.trim(),
                        address: values.address.trim(),
                        pincode: values.pincode.trim(),
                        city: values.city.trim(),
                        companyName: values.companyName.trim(),
                    })
                }
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <Field id="name" name="name" label="Customer Name" placeholder="Enter customer name" component={Input} autoFocus />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="phone" name="phone" label="Phone Number" placeholder="Enter phone number" component={PhoneInput} />
                        <Field id="email" name="email" type="email" label="Email Address" placeholder="Enter email address" component={Input} />
                    </div>
                    <Field id="companyName" name="companyName" label="Company / Shop / Garage Name" placeholder="Enter company, shop or garage name" component={Input} />
                    <Field id="address" name="address" label="Address" placeholder="Enter address" rows={2} component={Textarea} />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="city" name="city" label="City" placeholder="Enter city" component={Input} />
                        <Field id="pincode" name="pincode" label="Pincode" placeholder="6 digits" inputMode="numeric" maxLength={6} component={Input} />
                    </div>

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">
                            {isEdit ? "Update Customer" : "Save Customer"}
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddCustomerForm;
