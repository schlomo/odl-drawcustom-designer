import type { DrawElement } from '../../core/schema/elements'

export const SAMPLE_ELEMENTS: DrawElement[] = [
  {
    type: 'text',
    value: 'OEPL Designer',
    font: 'ppb.ttf',
    x: 10,
    y: 10,
    size: 32,
    color: 'black',
  },
  {
    type: 'rectangle',
    x_start: 10,
    x_end: 180,
    y_start: 50,
    y_end: 120,
    width: 2,
    fill: 'white',
    outline: 'black',
  },
  {
    type: 'circle',
    x: 220,
    y: 85,
    radius: 30,
    fill: 'red',
    outline: 'black',
    width: 2,
  },
  {
    type: 'line',
    x_start: 10,
    x_end: 250,
    y_start: 140,
    y_end: 140,
    width: 2,
    fill: 'black',
  },
]
