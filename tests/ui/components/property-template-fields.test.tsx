/** @vitest-environment jsdom */
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ElementPropertyForm } from '../../../src/ui/components/ElementPropertyForm'

const noopUpload = async () => ({ ok: true as const, mime: 'font/ttf' })

describe('property template fields', () => {
  it('commits templated progress edits on blur, not on every keystroke', () => {
    const onPropertyChange = vi.fn()
    const element = {
      type: 'progress_bar' as const,
      x_start: 0,
      y_start: 0,
      x_end: 100,
      y_end: 20,
      progress: "{{ states('sensor.progress') | float(50) }}",
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={[]}
        onPropertyChange={onPropertyChange}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
        properties={['progress']}
      />,
    )

    const textarea = screen.getByPlaceholderText(/states\('sensor\.value'\)/)
    expect(textarea).toHaveValue("{{ states('sensor.progress') | float(50) }}")
    fireEvent.change(textarea, {
      target: { value: "{{ states('sensor.progress') | float(75) }}" },
    })
    expect(onPropertyChange).not.toHaveBeenCalled()
    fireEvent.blur(textarea)
    expect(onPropertyChange).toHaveBeenCalledWith(
      'progress',
      "{{ states('sensor.progress') | float(75) }}",
    )
  })

  it('defers template mode entry when user presses { until blur', () => {
    const onPropertyChange = vi.fn()
    const element = {
      type: 'text' as const,
      value: 'Hello',
      x: 10,
      size: 20,
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={[]}
        onPropertyChange={onPropertyChange}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
        properties={['size']}
      />,
    )

    const input = screen.getByDisplayValue('20')
    fireEvent.keyDown(input, { key: '{' })
    expect(onPropertyChange).not.toHaveBeenCalled()
    expect(screen.getByPlaceholderText(/states\('sensor\.value'\)/)).toHaveValue('{{ }}')

    const textarea = screen.getByPlaceholderText(/states\('sensor\.value'\)/)
    fireEvent.blur(textarea)
    expect(onPropertyChange).toHaveBeenCalledWith('size', '{{ }}')
  })

  it('defers plot data template via braces button until blur', () => {
    const onPropertyChange = vi.fn()
    const element = {
      type: 'plot' as const,
      data: [{ entity: 'sensor.temperature' }],
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={['ppb.ttf']}
        onPropertyChange={onPropertyChange}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
        properties={['data']}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /template expression/i }))
    expect(onPropertyChange).not.toHaveBeenCalled()

    const textarea = screen.getByPlaceholderText(/sensor\.plot_data/)
    fireEvent.blur(textarea)
    expect(onPropertyChange).toHaveBeenCalledWith('data', '{{ }}')
  })

  it('does not show Mode dropdowns on scalar fields', () => {
    const element = {
      type: 'debug_grid' as const,
      spacing: 80,
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={['ppb.ttf']}
        onPropertyChange={() => {}}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
      />,
    )

    expect(screen.queryByText('Mode…')).toBeNull()
  })

  it('shows template textarea for templated visible boolean', () => {
    const element = {
      type: 'text' as const,
      value: 'Hi',
      x: 0,
      visible: "{{ is_state('input_boolean.show', 'on') }}",
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={[]}
        onPropertyChange={() => {}}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
        properties={['visible']}
      />,
    )

    expect(screen.getByPlaceholderText(/input_boolean\.show/)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('shows template textarea for templated enum/color field', () => {
    const element = {
      type: 'rectangle' as const,
      x_start: 0,
      x_end: 10,
      y_start: 0,
      y_end: 10,
      fill: "{{ 'red' if is_state('input_boolean.alert', 'on') else 'none' }}",
    }

    render(
      <ElementPropertyForm
        element={element}
        fontKeys={[]}
        onPropertyChange={() => {}}
        onUploadFont={noopUpload}
        onUploadImageForUrl={noopUpload}
        properties={['fill']}
      />,
    )

    expect(screen.getByPlaceholderText(/#ff0000/)).toHaveValue(
      "{{ 'red' if is_state('input_boolean.alert', 'on') else 'none' }}",
    )
  })
})
