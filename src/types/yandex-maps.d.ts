// src/types/yandex-maps.d.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace ymaps {
  type Ready = (callback: () => void) => void;
  export const ready: Ready;

  // 🔥 Добавляем функцию route
  export function route(
    points: (number[] | string)[],
    options?: { routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle'; [key: string]: any }
  ): Promise<Route>;

  // Описываем возвращаемый объект маршрута
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
        controls: string[];
      },
      options: any
    );

    geoObjects: {
      add(clusterer: Clusterer | Placemark | any): void;
    };
    container: {
      fitToViewport(): void;
    };
    setCenter(
      center: number[],
      zoom?: number,
      options?: { duration: number }
    ): void;
    events: {
      add(event: string, handler: (e: any) => void): void;
      remove(event: string, handler: (e: any) => void): void;
    };
  }

  class Placemark {
    constructor(
      geometry: number[],
      properties?: {
        balloonContentHeader?: string;
        balloonContentBody?: string;
        hintContent?: string;
        [key: string]: unknown;
      },
      options?: {
        preset?: string;
        iconColor?: string;
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
    add(placemarks: Placemark | Placemark[]): void;
    remove(placemarks: Placemark | Placemark[]): void;
    removeAll(): void;
  }
}

declare global {
  interface Window {
    ymaps: typeof ymaps;
  }
}