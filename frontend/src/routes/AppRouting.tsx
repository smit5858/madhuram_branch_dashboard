import { lazy } from "react";
import ProtectedRoute from "./ProtectedRoute"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import MainLayout from "@/layout/mainLayout/MainLayout";

const Login = lazy(() => import('@/pages/Account/Login')); 
const Sales = lazy(() => import('@/pages/Sales/Sales')); 

const privateRoutes = (Element: any , props?: any, roles?: string[]) => {
    return <ProtectedRoute roles={roles} element={props ? <Element {...props} /> : <Element />} />
}

const routesConfig = [
    {
        errorElement: <div>404</div>,
        children: [
            {path: '/', element: <Navigate to="/login" />},
            {path: '/login', element: <Login />},
            {path: '/sales', element: <MainLayout>{privateRoutes(Sales)}</MainLayout>},
        ],
    }
];



const routes = createBrowserRouter(routesConfig);

const AppRouting = () => {

    return <RouterProvider router={routes} />
}

export default AppRouting