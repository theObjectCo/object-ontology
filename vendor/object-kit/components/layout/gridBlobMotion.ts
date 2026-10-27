/* Powiększenie wokół kursora. Promień w jednostkach krótszego boku okna, żeby
   plama reagowania była kołem w pikselach, a nie elipsą (tak samo jak pole
   metaballi korzysta z getViewportMetric). */
export const POINTER_RADIUS = 0.18;
export const POINTER_PEAK_SCALE = 1.6;
/* Kwantyzacja skali: bez niej ciągła wartość zmieniałaby się w każdym węźle co
   ramkę. Zapis transformu to zmiana geometrii (retesselacja ścieżki), znacznie
   droższa od samego fill-opacity, więc opłaca się pisać rzadko. */
export const SCALE_STEPS = 12;
/* Stałe czasowe dojścia do docelowej skali, w milisekundach. Trójkąt reaguje na
   nadjeżdżający kursor szybko, ale wraca do rozmiaru bazowego leniwie, więc za
   kursorem zostaje gasnący ślad zamiast twardej krawędzi plamy. */
export const SCALE_TAU_GROW = 70;
export const SCALE_TAU_SHRINK = 480;
/* Impuls przy nawigacji: wszystkie trójkąty rosną i wracają jednocześnie.
   Szczyt bierze z POINTER_PEAK_SCALE, żeby powiększenie pod kursorem i impuls
   nie mogły się rozjechać — to ta sama gramatyka ruchu w dwóch miejscach. */
export const PULSE_DURATION = 350;

/* Powyżej tego progu (4K to ~21 tys. węzłów) skala zostaje stała — sama
   animacja krycia jest tam wystarczająco kosztowna. */
export const MAX_SCALE_NODES = 12000;

export const NS = 'http://www.w3.org/2000/svg';

