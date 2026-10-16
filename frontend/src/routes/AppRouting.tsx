import { lazy } from "react";
import ProtectedRoute from "./ProtectedRoute"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import MainLayout from "@/layout/mainLayout/MainLayout";

const Login = lazy(() => import('@/pages/Account/Login')); 
const Sales = lazy(() => import('@/pages/Sales/Sales')); 
const Branch = lazy(() => import('@/pages/Branch/Branch'));
const Employee = lazy(() => import('@/pages/Employee/Employee'));
const Products = lazy(() => import('@/pages/Products/Products'));
const Customers = lazy(() => import('@/pages/Customers/Customers'));
const Income = lazy(() => import('@/pages/Income/Income'));
const Expense = lazy(() => import('@/pages/Expense/Expense'));

const privateRoutes = (Element: any , props?: any, roles?: string[]) => {
    return <ProtectedRoute roles={roles} element={props ? <Element {...props} /> : <Element />} />
}

const routesConfig = [
    {
        errorElement: <div>404</div>,
        children: [
            {path: '/', element: <Navigate to="/login" />},
            {path: '/login', element: <Login />},
            {path: '/products', element: <MainLayout>{privateRoutes(Products)}</MainLayout>},
            {path: '/sales', element: <MainLayout>{privateRoutes(Sales)}</MainLayout>},
            {path: '/customers', element: <MainLayout>{privateRoutes(Customers)}</MainLayout>},
            {path: '/income', element: <MainLayout>{privateRoutes(Income)}</MainLayout>},
            {path: '/expense', element: <MainLayout>{privateRoutes(Expense)}</MainLayout>},
            {path: '/branch', element: <MainLayout>{privateRoutes(Branch)}</MainLayout>},
            {path: '/employee', element: <MainLayout>{privateRoutes(Employee, undefined, ["admin"])}</MainLayout>},
        ],
    }
];



const routes = createBrowserRouter(routesConfig);

const AppRouting = () => {

    return <RouterProvider router={routes} />
}

export default AppRouting