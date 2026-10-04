import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from 'react-redux';
import { store } from "./store/store";
import AppRouting from "./routes/AppRouting";

const App = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                refetchOnWindowFocus: false,
            },
        },
    });
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