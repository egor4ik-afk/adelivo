// src/types/yandex-maps.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace ymaps {
  type Ready = (callback: () => void) => void;
  export const ready: Ready;

  export namespace templateLayoutFactory {
    export function createClass(template: string, overrides?: any): any;
  }

  export namespace multiRouter {
    class MultiRoute {
      constructor(
        model: {
          referencePoints: (number[] | string)[];
          params?: { routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle'; [key: string]: any };
        },
        options?: any
      );
      model: {
        events: {
          add(event: string, handler: (e?: any) => void): void;
          remove(event: string, handler: (e?: any) => void): void;
        };
      };
      getActiveRoute(): any;
      destroy(): void;
    }
  }

  export function route(
    points: (number[] | string)[],
    options?: { routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle'; [key: string]: any }
  ): Promise<Route>;

  interface Route {
    getHumanTime(): string;
    getHumanLength(): string;
    getPaths(): RoutePaths;
  }

  interface RoutePaths {
    getLength(): number;
    get(index: number): RoutePath;
  }

  interface RoutePath {
    getHumanTime(): string;
    getHumanLength(): string;
  }

  class Map {
    constructor(
      element: string | HTMLElement,
      state: {
        center: number[];
        zoom: number;
        controls?: string[];
        behaviors?: string[]; // 🔥 Добавлено behaviors
      },
      options?: any
    );

    geoObjects: {
      add(geoObject: Clusterer | Placemark | multiRouter.MultiRoute | any): void;
      remove(geoObject: any): void; // 🔥 Добавлен remove
      removeAll(): void;
      each(callback: (geoObject: any) => void): void; // 🔥 Добавлен each
      getBounds(): number[][] | null;
    };
    container: {
      fitToViewport(): void;
    };
    behaviors: { // 🔥 Добавлен объект behaviors
      enable(behavior: string | string[]): void;
      disable(behavior: string | string[]): void;
    };
    setCenter(
      center: number[],
      zoom?: number,
      options?: { duration: number }
    ): void;
    setBounds(
      bounds: number[][],
      options?: { checkZoomRange?: boolean; zoomMargin?: number; maxZoom?: number; duration?: number }
    ): void;
    events: {
      add(event: string, handler: (e: any) => void): void;
      remove(event: string, handler: (e: any) => void): void;
    };
    controls: {
      get(controlName: string): any;
    };
  }

  class Placemark {
    constructor(
      geometry: number[],
      properties?: {
        balloonContentHeader?: string;
        balloonContentBody?: string;
        balloonContent?: string;
        hintContent?: string;
        iconContent?: string;
        iconCaption?: string;
        [key: string]: unknown;
      },
      options?: {
        preset?: string;
        iconColor?: string;
        iconLayout?: string | any;
        iconShape?: any;
        iconOffset?: number[];
        [key: string]: unknown;
      }
    );
    events: {
      add(event: string, handler: () => void): void;
      remove(event: string, handler: () => void): void;
    };
  }

  class Clusterer {
    constructor(options?: {
      clusterIconLayout?: string;
      clusterIconPieChartRadius?: number;
      clusterIconPieChartCoreRadius?: number;
      clusterIconPieChartStrokeWidth?: number;
      [key: string]: unknown;
    });
    add(placemarks: Placemark | Placemark[] | any): void;
    remove(placemarks: Placemark | Placemark[]): void;
    removeAll(): void;
  }
}

declare global {
  interface Window {
    ymaps: typeof ymaps;
  }
}