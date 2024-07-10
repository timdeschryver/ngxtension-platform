import { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';

import convertLoadComponentGenerator from './generator';
import { ConvertLoadComponentGeneratorSchema } from './schema';

const filesMap = {
	singleRoute: `
import { Routes } from '@angular/router';
import { MenuListComponent } from './menu-list/menu-list.component';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: MenuListComponent
  },
];
`,
	multipleRoutes: `
import { Routes } from '@angular/router';
import { MenuListComponent } from './menu-list/menu-list.component';
import { HelpComponent } from '@/help.component';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: MenuListComponent
  },
  {
    path: 'help',
    component: HelpComponent
  },
];
`,
	importWithAlias: `
import { Routes } from '@angular/router';
import { MenuListComponent as FooComponent } from './menu-list/menu-list.component';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: FooComponent
  },
];
`,
	importAsImportNamespaceSpecifier: `
import { Routes } from '@angular/router';
import * as Components from './components';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: Components.MenuListComponent
  },
];
`,
	ignoresRoutesWithLoadComponents: `
import { Routes } from '@angular/router';
import { MenuListComponent } from './menu-list/menu-list.component';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: MenuListComponent,
    loadComponent: () => import('./menu-list/menu-list.component').then(m => m.MenuListComponent)
  },
  {
    path: 'help',
    loadComponent: () => import('@/help.component').then(m => m.HelpComponent)
  },
];
`,
	ignoresVariableDeclarationsThatAreNoRoutes: `
import { MenuListComponent } from './menu-list/menu-list.component';

export const MenuRoutes = [
  {
    path: 'menu',
    component: MenuListComponent,
  }
];
`,
	ignoresWhenRoutesAreNotImportedFromAngularRouter: `
import { Routes } from '@awesome/router';
import { MenuListComponent } from './menu-list/menu-list.component';

export const MenuRoutes: Routes = [
  {
    path: 'menu',
    component: MenuListComponent
  },
];
`,
} as const;

describe('convertLoadComponentGenerator', () => {
	let tree: Tree;
	const options: ConvertLoadComponentGeneratorSchema = {
		path: 'libs/my-file.ts',
	};

	function setup(file: keyof typeof filesMap) {
		tree = createTreeWithEmptyWorkspace({ layout: 'apps-libs' });
		tree.write('package.json', `{"dependencies": {"@angular/core": "17.1.0"}}`);
		tree.write(`libs/my-file.ts`, filesMap[file]);
		return () => {
			return [tree.read('libs/my-file.ts', 'utf8'), filesMap[file]];
		};
	}

	it('should update component to loadComponent', async () => {
		const readContent = setup('singleRoute');
		await convertLoadComponentGenerator(tree, options);
		const [updated] = readContent();
		expect(updated).toMatchSnapshot();
	});

	it('should update all components to loadComponents', async () => {
		const readContent = setup('multipleRoutes');
		await convertLoadComponentGenerator(tree, options);
		const [updated] = readContent();
		expect(updated).toMatchSnapshot();
	});

	it('should use the "real" component name instead of alias given to the import', async () => {
		const readContent = setup('importWithAlias');
		await convertLoadComponentGenerator(tree, options);
		const [updated] = readContent();
		expect(updated).toMatchSnapshot();
	});

	it('should migrate namespace imports', async () => {
		const readContent = setup('importAsImportNamespaceSpecifier');
		await convertLoadComponentGenerator(tree, options);
		const [updated] = readContent();
		expect(updated).toMatchSnapshot();
	});

	it('does not update if loadComponent is present', async () => {
		const readContent = setup('ignoresRoutesWithLoadComponents');
		await convertLoadComponentGenerator(tree, options);
		const [updated, original] = readContent();
		expect(updated).toBe(original);
	});

	it('does not update if routes are not typed as Routes', async () => {
		const readContent = setup('ignoresVariableDeclarationsThatAreNoRoutes');
		await convertLoadComponentGenerator(tree, options);
		const [updated, original] = readContent();
		expect(updated).toBe(original);
	});

	it('does not update if routes are not imported from @angular/router', async () => {
		const readContent = setup(
			'ignoresWhenRoutesAreNotImportedFromAngularRouter',
		);
		await convertLoadComponentGenerator(tree, options);
		const [updated, original] = readContent();
		expect(updated).toBe(original);
	});
});
