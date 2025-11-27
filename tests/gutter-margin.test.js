import { describe, it, expect } from 'vitest';
import { JourneyLayout } from '../src/JourneyLayout.js';

// Complex example graph used by multiple tests
const complexNodes = new Map([
  ['browse-products', { width: 200, height: 100 }],
  ['product-details', { width: 200, height: 100 }],
  ['shopping-cart', { width: 200, height: 100 }],
  ['checkout', { width: 200, height: 100 }],
  ['guest-information', { width: 200, height: 100 }],
  ['sign-in', { width: 200, height: 100 }],
  ['shipping-address', { width: 200, height: 100 }],
  ['delivery-method', { width: 200, height: 100 }],
  ['payment', { width: 200, height: 100 }],
  ['review-order', { width: 200, height: 100 }],
  ['processing', { width: 200, height: 100 }],
  ['payment-error', { width: 200, height: 100 }],
  ['order-confirmed', { width: 200, height: 100 }],
]);

const complexEdges = [
  { source: 'browse-products', dest: 'product-details' },
  { source: 'browse-products', dest: 'shopping-cart' },
  { source: 'product-details', dest: 'shopping-cart' },
  { source: 'product-details', dest: 'browse-products' },
  { source: 'shopping-cart', dest: 'checkout' },
  { source: 'shopping-cart', dest: 'browse-products' },
  { source: 'shopping-cart', dest: 'product-details' },
  { source: 'checkout', dest: 'guest-information' },
  { source: 'checkout', dest: 'sign-in' },
  { source: 'guest-information', dest: 'shipping-address' },
  { source: 'guest-information', dest: 'shopping-cart' },
  { source: 'sign-in', dest: 'shipping-address' },
  { source: 'sign-in', dest: 'guest-information' },
  { source: 'shipping-address', dest: 'delivery-method' },
  { source: 'shipping-address', dest: 'checkout' },
  { source: 'delivery-method', dest: 'payment' },
  { source: 'delivery-method', dest: 'shipping-address' },
  { source: 'payment', dest: 'review-order' },
  { source: 'payment', dest: 'delivery-method' },
  { source: 'review-order', dest: 'processing' },
  { source: 'review-order', dest: 'shopping-cart' },
  { source: 'review-order', dest: 'shipping-address' },
  { source: 'review-order', dest: 'payment' },
  { source: 'processing', dest: 'order-confirmed' },
  { source: 'processing', dest: 'payment-error' },
  { source: 'payment-error', dest: 'payment' },
  { source: 'payment-error', dest: 'shopping-cart' },
  { source: 'order-confirmed', dest: 'browse-products' },
];

describe('Gutter Margin', () => {
  it('should have 20px margin between edge lanes and adjacent nodes', () => {
    const layout = new JourneyLayout({ edgeSpacing: 20 });
    const result = layout.computeLayout({ nodes: complexNodes, edges: complexEdges, roots: ['browse-products'] });

    // Find the payment-error -> shopping-cart edge
    const paymentErrorToCart = result.edgePaths.find(
      e => e.source === 'payment-error' && e.dest === 'shopping-cart'
    );

    expect(paymentErrorToCart).toBeDefined();
    expect(paymentErrorToCart.points.length).toBeGreaterThan(2);

    // Get all nodes in column 0 (the main column)
    const col0Nodes = [];
    result.placements.forEach((placement, nodeId) => {
      if (placement.col === 0) {
        const pos = result.positions.get(nodeId);
        const node = complexNodes.get(nodeId);
        col0Nodes.push({
          nodeId,
          row: placement.row,
          leftEdge: pos.x,
          rightEdge: pos.x + node.width,
        });
      }
    });

    // The edge travels vertically - find the X coordinate of the vertical segment
    // For routed edges, points[1] and points[2] define the vertical segment
    const verticalX = paymentErrorToCart.points[1].x;

    console.log('\n=== Layout Info ===');
    console.log('gutterSizes:', result.gutterSizes);

    // Access internal layout info
    const paymentErrorPlacement = result.placements.get('payment-error');
    const shoppingCartPlacement = result.placements.get('shopping-cart');
    console.log('payment-error placement:', paymentErrorPlacement);
    console.log('shopping-cart placement:', shoppingCartPlacement);

    // Check all edges using vertical gutter v:1
    console.log('\n=== Edges using vertical gutter v:1 ===');
    result.edgeRoutes.forEach(route => {
      if (route.gutterLanes && route.gutterLanes.has('v:1')) {
        console.log(`${route.source} -> ${route.dest}: lane ${route.gutterLanes.get('v:1')}`);
      }
    });

    console.log('\n=== Payment Error -> Shopping Cart Edge ===');
    const route = result.edgeRoutes.find(
      e => e.source === 'payment-error' && e.dest === 'shopping-cart'
    );
    console.log('Route type:', route.routeType);
    console.log('gutterLanes:', [...route.gutterLanes.entries()]);
    console.log('Points:', paymentErrorToCart.points);
    console.log('Vertical segment X:', verticalX);

    // Check that the vertical segment is at least 20px away from all nodes in column 0
    col0Nodes.forEach(node => {
      const distanceFromLeftEdge = node.leftEdge - verticalX;
      const distanceFromRightEdge = verticalX - node.rightEdge;

      console.log(`Node ${node.nodeId} (row ${node.row}): left=${node.leftEdge}, right=${node.rightEdge}`);
      console.log(`  Distance from left edge: ${distanceFromLeftEdge}`);
      console.log(`  Distance from right edge: ${distanceFromRightEdge}`);

      // The edge should be at least 20px from any node edge
      // If edge is to the left of node (or touching left edge), check distance from left edge
      if (verticalX <= node.leftEdge) {
        expect(distanceFromLeftEdge).toBeGreaterThanOrEqual(20);
      }
      // If edge is to the right of node (or touching right edge), check distance from right edge
      if (verticalX >= node.rightEdge) {
        expect(distanceFromRightEdge).toBeGreaterThanOrEqual(20);
      }
    });
  });

  it('should give different vertical positions to payment-error back edges', () => {
    const layout = new JourneyLayout({ edgeSpacing: 20 });
    const result = layout.computeLayout({ nodes: complexNodes, edges: complexEdges, roots: ['browse-products'] });

    // Find the two payment-error back edges
    const paymentErrorToPayment = result.edgePaths.find(
      e => e.source === 'payment-error' && e.dest === 'payment'
    );
    const paymentErrorToCart = result.edgePaths.find(
      e => e.source === 'payment-error' && e.dest === 'shopping-cart'
    );

    expect(paymentErrorToPayment).toBeDefined();
    expect(paymentErrorToCart).toBeDefined();

    // Both edges have a vertical segment - points[1] and points[2] form the vertical line
    // Get the X coordinate of each vertical segment
    const verticalX1 = paymentErrorToPayment.points[1].x;
    const verticalX2 = paymentErrorToCart.points[1].x;

    // Get routes to see gutterLanes
    const route1 = result.edgeRoutes.find(
      e => e.source === 'payment-error' && e.dest === 'payment'
    );
    const route2 = result.edgeRoutes.find(
      e => e.source === 'payment-error' && e.dest === 'shopping-cart'
    );

    console.log('\n=== Payment Error Back Edges ===');
    console.log('payment-error -> payment:');
    console.log('  gutterLanes:', [...route1.gutterLanes.entries()]);
    console.log('  points:', paymentErrorToPayment.points);
    console.log('payment-error -> shopping-cart:');
    console.log('  gutterLanes:', [...route2.gutterLanes.entries()]);
    console.log('  points:', paymentErrorToCart.points);
    console.log('Vertical X positions:', verticalX1, verticalX2);

    // The two edges should NOT share the same vertical X position
    // They should be at least edgeSpacing (20px) apart
    expect(Math.abs(verticalX1 - verticalX2)).toBeGreaterThanOrEqual(20);
  });
});
