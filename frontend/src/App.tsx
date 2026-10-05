import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from 'react-redux';
import { store } from "./store/store";
import AppRouting from "./routes/AppRouting";

// Created once at module level so the query cache survives App re-renders
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
        },
    },
});

const App = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <Provider store={store}>
                <Toaster />
                <AppRouting />
            </Provider>
        </QueryClientProvider>
    )
}

export default App;