import { Button } from '@/components/Button';
import { Input } from '@/components/formik-fields/Input';
import { PasswordInput } from '@/components/formik-fields/PasswordInput';
import { loginSchema } from '@/validation/validation';
import { Field, Form, Formik } from 'formik';
import { useMemo } from 'react'
import LOGO from '@/assets/logo.jpg'
import { useMutation } from '@tanstack/react-query';
import accountService from '@/services/account-service';
import toast from 'react-hot-toast';
import type { ILoginRequestModel, ILoginResponseModel } from "@/models/Account";

const services = [
    {
        title: 'New Car Sales',
        description: 'Showroom & bookings',
        icon: 'M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M5 13h14M5 13a2 2 0 0 0-2 2v2h2m14-4a2 2 0 0 1 2 2v2h-2M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0m10 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0m-6 0h6',
    },
    {
        title: 'Genuine Spare Parts',
        description: 'Inventory & orders',
        icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    },
    {
        title: 'Service & Repair',
        description: 'Workshop job cards',
        icon: 'M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z',
    },
];

const Logo = () => (
    <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl overflow-hidden">
            <img src={LOGO} alt="Madhuram Motors Logo" className="h-full w-full object-cover " />
        </div>
        <div className="leading-tight">
            <p className="text-base font-semibold">Madhuram Motors</p>
            <p className="text-xs opacity-60">Branch Dashboard</p>
        </div>
    </div>
);

const CarIllustration = () => (
    <svg viewBox="0 0 400 170" fill="none" aria-hidden="true" className="w-full max-w-md">
        <path d="M30 60h60M10 80h50M40 100h30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-blue-400/40" />
        <path
            d="M70 118v-14q2-10 15-13l70-10 38-30q10-7 24-7h78q14 0 24 8l35 29 34 5q18 4 20 16v16q0 6-6 6h-22a32 32 0 0 0-64 0H160a32 32 0 0 0-64 0H76q-6 0-6-6Z"
            className="fill-blue-500/15 stroke-blue-400"
            strokeWidth="3"
            strokeLinejoin="round"
        />
        <path d="M205 58q5-4 13-4h37v30h-82Z" className="fill-white/10 stroke-blue-300/60" strokeWidth="2" strokeLinejoin="round" />
        <path d="M265 54h30q11 0 18 6l26 24h-74Z" className="fill-white/10 stroke-blue-300/60" strokeWidth="2" strokeLinejoin="round" />
        <path d="M260 92v26M380 106h8" className="stroke-blue-300/50" strokeWidth="2" strokeLinecap="round" />
        <circle cx="128" cy="124" r="24" className="fill-slate-800 stroke-slate-400" strokeWidth="4" />
        <circle cx="128" cy="124" r="9" className="fill-blue-400" />
        <circle cx="332" cy="124" r="24" className="fill-slate-800 stroke-slate-400" strokeWidth="4" />
        <circle cx="332" cy="124" r="9" className="fill-blue-400" />
        <path d="M60 150h340" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-white/15" />
    </svg>
);

const Login = () => {
    const { mutate: login, isPending: loginLoading } = useMutation({
        mutationFn: (values: ILoginRequestModel) => accountService.login(values),
        onSuccess: (response) => {
            if (response?.data?.status) {
                const data: ILoginResponseModel = response.data.data;
                toast.success(response.data.message || `Welcome, ${data.employee.name}`);
            } else if (response) {
                toast.error(response.data?.message || 'Internal server error. Please try again later.');
            }
        },
        onError: (error) => {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    })
    const initialValues = useMemo<ILoginRequestModel>(() => ({
        email: '',
        password: ''
    }), []);

    return (
        <div className="grid min-h-screen bg-white lg:grid-cols-2">
            {/* Brand panel */}
            <aside className="relative hidden overflow-hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
                <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-blue-500/20 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-blue-500/10 blur-3xl" />

                <Logo />

                <div className="relative space-y-10">
                    <div className="space-y-3">
                        <h1 className="text-4xl font-semibold leading-tight">
                            Cars, parts & service.<br />
                            <span className="text-blue-400">All in one place.</span>
                        </h1>
                        <p className="max-w-md text-slate-400">
                            Manage showroom sales, spare-parts stock and workshop repairs across every Madhuram Motors branch.
                        </p>
                    </div>

                    <CarIllustration />

                    <ul className="grid grid-cols-3 gap-3">
                        {services.map((service) => (
                            <li key={service.title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mb-3 size-6 text-blue-400">
                                    <path d={service.icon} />
                                </svg>
                                <p className="text-sm font-medium">{service.title}</p>
                                <p className="text-xs text-slate-400">{service.description}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Madhuram Motors. All rights reserved.</p>
            </aside>

            {/* Sign-in form */}
            <main className="flex items-center justify-center px-4 py-12 sm:px-8">
                <div className="w-full max-w-sm space-y-8">
                    <div className="text-gray-900 lg:hidden">
                        <Logo />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-semibold text-gray-900">Welcome back</h2>
                        <p className="text-sm text-gray-500">Sign in to your branch dashboard to continue.</p>
                    </div>

                    <Formik
                        initialValues={initialValues}
                        validationSchema={loginSchema}
                        onSubmit={(values) => login(values)}
                    >
                        {({ dirty }) => (
                            <Form className="space-y-4" noValidate>
                                <Field
                                    name="email"
                                    type="email"
                                    label="Email"
                                    placeholder="you@madhurammotors.com"
                                    autoComplete="email"
                                    component={Input}
                                />
                                <Field
                                    name="password"
                                    label="Password"
                                    placeholder="Enter your password"
                                    component={PasswordInput}
                                />
                                <Button type="submit" loading={loginLoading} disabled={!dirty} className="mt-2 h-11">
                                    {loginLoading ? 'Signing in…' : 'Sign in'}
                                </Button>
                            </Form>
                        )}
                    </Formik>

                    <p className="text-center text-xs text-gray-400">
                        Having trouble signing in? Contact your branch administrator.
                    </p>
                </div>
            </main>
        </div>
    )
}

export default Login
