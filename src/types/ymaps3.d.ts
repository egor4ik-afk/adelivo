// src/types/ymaps3.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace ymaps3 {
    const ready: Promise<void>;
  
    // 'import' — зарезервированное слово, поэтому объявляем через namespace
    function importModule(pkg: string): Promise<any>;
  
    function route(params: {
      points: Array<{ type: "point"; coordinates: [number, number] }>;
      type?: "driving" | "transit" | "walking" | "bicycle";
      bounds?: boolean;
    }): Promise<RouteResult>;
  
    interface RouteResult {
      toGeoJson?(): GeoJSON;
      properties?: {
        distance?: number;
        duration?: number;
      };
      geometry?: GeoJSON;
    }
  
    class YMap {
      constructor(
        element: HTMLElement,
        props: {
          location: {
            center?: [number, number];
            zoom?: number;
            bounds?: [[number, number], [number, number]];
            duration?: number;
          };
          behaviors?: string[];
          theme?: "light" | "dark";
        }
      );
      addChild(child: any): void;
      removeChild(child: any): void;
      update(props: { location?: { center?: [number, number]; zoom?: number; bounds?: [[number, number], [number, number]]; duration?: number } }): void;
      destroy(): void;
    }
  
    class YMapDefaultSchemeLayer {
      constructor(props?: { theme?: "light" | "dark" });
    }
    class YMapDefaultFeaturesLayer {
      constructor(props?: Record<string, any>);
    }
  
    class YMapMarker {
      constructor(
        props: { coordinates: [number, number]; anchor?: [number, number]; zIndex?: number },
        element: HTMLElement
      );
    }
  
    class YMapFeature {
      constructor(props: {
        geometry: any;
        style?: {
          stroke?: Array<{ color: string; width: number; opacity?: number }>;
          fill?: string;
          fillOpacity?: number;
        };
      });
    }
  
    class YMapControls {
      constructor(props: {
        position: "top" | "bottom" | "left" | "right"
          | "top left" | "top right"
          | "bottom left" | "bottom right";
      });
      addChild(child: any): void;
    }
  
    interface GeoJSON {
      type: string;
      coordinates?: any;
      geometry?: any;
      features?: any[];
    }
  }
  
  // Пакет @yandex/ymaps3-default-ui-theme
  // Подключается через: const ui = await (window as any).ymaps3.import('@yandex/ymaps3-default-ui-theme')
  interface Ymaps3DefaultUI {
    YMapZoomControl: new (props?: { easing?: any; duration?: number }) => any;
    YMapRotateControl: new (props?: { easing?: any; duration?: number }) => any;
    YMapGeolocationControl: new (props?: { onGeolocatePosition?: (coords: [number, number]) => void; easing?: any; duration?: number }) => any;
    YMapScaleControl: new (props?: Record<string, any>) => any;
  }
  
  declare global {
    interface Window {
      ymaps3: typeof ymaps3 & {
        // ymaps3.import() — реальный метод в рантайме, но 'import' зарезервирован в TS
        // поэтому в коде всегда используем: (window as any).ymaps3.import(...)
        import: (pkg: string) => Promise<any>;
      };
    }
  }