import { HttpStatusCode } from '@/shared/enum/https-status-code';
import { store } from '@/store/store';
import { getBaseURL } from '@/util/CommonFunction';
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

axios.interceptors.request.use(
    (config:InternalAxiosRequestConfig) => {
        const storeData = store.getState();
        const token = `Token ${storeData?.auth?.token}`;

        if (config.url) {
            config.url = getBaseURL(import.meta.env.VITE_APP_BASE_URL) + config.url;
        }
        config.headers.set('Authorization', token);

        return config;
    },
    (error: AxiosError) => {
        switch (error.response?.status) {
            case HttpStatusCode.BadRequest:
            case HttpStatusCode.ConflictError:
            case HttpStatusCode.InternalServerError:
                toast.error("Internal Server Error");
                return;
        }
        return Promise.reject("Something went wrong");
    }
)

axios.interceptors.response.use(
    (response: AxiosResponse) => {
        return response;
    },
    (error: AxiosError) => {
        switch (error.response?.status) {
            case HttpStatusCode.Forbidden:
            case HttpStatusCode.Unauthorized:
                window.location.href = '/login';
                return  
            case HttpStatusCode.BadRequest:
            case HttpStatusCode.ConflictError:
            case HttpStatusCode.InternalServerError:
            case HttpStatusCode.NotFound:
                if ((error.response!.data as { message: string }).message) {
                    toast.error((error.response!.data as { message: string }).message);
                }
                return;
        }

        return Promise.reject("Something went wrong");
    }
)

export default {
    get: axios.get,
    post: axios.post,
    put: axios.put,
    delete: axios.delete,
    patch: axios.patch,
};