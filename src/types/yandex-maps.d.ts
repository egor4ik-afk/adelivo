/* eslint-disable @typescript-eslint/no-explicit-any */

declare namespace ymaps {
  type Ready = (callback: () => void) => void;
  export const ready: Ready;

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
      add(clusterer: Clusterer): void;
    };
    container: {
      fitToViewport(): void;
    };
    setCenter(
      center: number[],
      zoom: number,
      options: { duration: number }
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
