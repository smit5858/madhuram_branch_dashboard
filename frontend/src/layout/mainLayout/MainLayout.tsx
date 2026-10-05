import { useDocumentTitle } from "@/hook/useDocumentTitle";
import { memo, type ReactNode } from "react"
import { useLocation } from "react-router-dom"
import Sidebar from "../sidebar/Sidebar";
import Header from "../header/Header";

interface MainLayoutProps {
    children?: ReactNode;
}

const MainLayout = memo(({ children }: MainLayoutProps) => {
    const { pathname } = useLocation();
    useDocumentTitle(pathname.split("/").pop()?.toUpperCase() || "");

    return (
        <div className='main-layout h-screen overflow-hidden'>
            <div className="flex h-full">
                <div className="sidebar-main relative h-full">
                    <Sidebar />
                </div>
                <div className='main-content-container'>
                    <div className="header-main">
                        <Header />
                    </div>
                    <div className="relative content-main">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    )
})

export default MainLayout   