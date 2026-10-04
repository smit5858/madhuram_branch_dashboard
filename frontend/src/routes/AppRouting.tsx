import { lazy } from "react";
import ProtectedRoute from "./ProtectedRoute"
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";

const Login = lazy(() => import('@/pages/Account/Login')); 

const routesConfig = [
    {
        errorElement: <div>404</div>,
        children: [
            {path: '/', element: <Navigate to="/login" />},
            {path: '/login', element: <Login />},
        ],
    }
];

const privateRoutes = (Element: any , props?: any) => {
    return <ProtectedRoute element={props ? <Element {...props} /> : <Element />} />
}

const routes = createBrowserRouter(routesConfig);

const AppRouting = () => {

    return <RouterProvider router={routes} />
}

export default AppRouting