import {
	formatFiles,
	getProjects,
	logger,
	readJson,
	readProjectConfiguration,
	Tree,
	visitNotIgnoredFiles,
} from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { exit } from 'node:process';
import { SyntaxKind } from 'ts-morph';
import { ContentsStore } from '../shared-utils/contents-store';
import { ConvertLoadComponentGeneratorSchema } from './schema';

function trackContents(
	tree: Tree,
	contentsStore: ContentsStore,
	fullPath: string,
) {
	if (fullPath.endsWith('.ts')) {
		const fileContent =
			tree.read(fullPath, 'utf8') || readFileSync(fullPath, 'utf8');

		if (
			!fileContent.includes('@angular/router') &&
			!fileContent.includes('Routes') &&
			!fileContent.includes('component')
		) {
			return;
		}

		contentsStore.track(fullPath, fileContent);
	}
}

export async function convertLoadComponentGenerator(
	tree: Tree,
	options: ConvertLoadComponentGeneratorSchema,
) {
	const contentsStore = new ContentsStore();
	const packageJson = readJson(tree, 'package.json');
	const angularCorePackage = packageJson['dependencies']['@angular/core'];

	if (!angularCorePackage) {
		logger.error(`[ngxtension] No @angular/core detected`);
		return exit(1);
	}

	const { path, project } = options;

	if (path && project) {
		logger.error(
			`[ngxtension] Cannot pass both "path" and "project" to convertLoadComponentGenerator`,
		);
		return exit(1);
	}

	if (path) {
		if (!tree.exists(path)) {
			logger.error(`[ngxtension] "${path}" does not exist`);
			return exit(1);
		}

		trackContents(tree, contentsStore, path);
	} else if (project) {
		try {
			const projectConfiguration = readProjectConfiguration(tree, project);

			if (!projectConfiguration) {
				throw `"${project}" project not found`;
			}

			visitNotIgnoredFiles(tree, projectConfiguration.root, (path) => {
				trackContents(tree, contentsStore, path);
			});
		} catch (err) {
			logger.error(`[ngxtension] ${err}`);
			return;
		}
	} else {
		const projects = getProjects(tree);
		for (const project of projects.values()) {
			visitNotIgnoredFiles(tree, project.root, (path) => {
				trackContents(tree, contentsStore, path);
			});
		}
	}

	for (const { path: sourcePath } of contentsStore.collection) {
		const sourceFile = contentsStore.project.getSourceFile(sourcePath)!;

		const hasRoutes = sourceFile.getImportDeclaration(
			(importDecl) =>
				importDecl.getModuleSpecifierValue() === '@angular/router' &&
				importDecl
					.getNamedImports()
					.some((namedImport) => namedImport.getName() === 'Routes'),
		);

		if (!hasRoutes) {
			continue;
		}

		const variableDeclarations = sourceFile.getVariableDeclarations();
		const importDeclarations = sourceFile.getImportDeclarations();
		const imports = importDeclarations.flatMap((importDeclaration) => {
			const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
			const namedImports = importDeclaration.getNamedImports();
			const namespaceImport = importDeclaration.getNamespaceImport();

			if (namespaceImport) {
				return [
					{
						namespaceImport: namespaceImport.getText(),
						moduleSpecifier: moduleSpecifier,
						namedImport: null,
						aliased: null,
					},
				];
			}

			return namedImports.map((namedImport) => {
				return {
					namedImport: namedImport.getName(),
					aliased:
						namedImport.getAliasNode()?.getText() ?? namedImport.getName(),
					moduleSpecifier: moduleSpecifier,
					namespaceImport: null,
				};
			});
		});

		for (const variableDeclaration of variableDeclarations) {
			if (variableDeclaration.getType().getText() !== 'Routes') {
				continue;
			}

			const routes = variableDeclaration.getInitializerIfKind(
				SyntaxKind.ArrayLiteralExpression,
			);
			for (const route of routes.getElements()) {
				if (!route.isKind(SyntaxKind.ObjectLiteralExpression)) {
					continue;
				}

				const componentProperty = route.getProperty('component');
				const loadComponentProperty = route.getProperty('loadComponent');

				if (
					!loadComponentProperty &&
					componentProperty &&
					componentProperty.isKind(SyntaxKind.PropertyAssignment)
				) {
					const componentPropertyInitializer =
						componentProperty.getInitializer();
					if (
						componentPropertyInitializer.isKind(
							SyntaxKind.PropertyAccessExpression,
						)
					) {
						const [namespaceImport, componentName] =
							componentPropertyInitializer.getText().split('.');
						const importInfo = imports.find(
							(importInfo) => importInfo.namespaceImport === namespaceImport,
						);
						if (!importInfo) {
							continue;
						}
						componentProperty.replaceWithText(
							`loadComponent: () => import('${importInfo.moduleSpecifier}').then((c) => c.${componentName})`,
						);
					} else {
						const componentName = componentPropertyInitializer.getText();
						const importInfo = imports.find(
							(importInfo) => importInfo.aliased === componentName,
						);
						if (!importInfo) {
							continue;
						}
						componentProperty.replaceWithText(
							`loadComponent: () => import('${importInfo.moduleSpecifier}').then((c) => c.${importInfo.namedImport})`,
						);
					}
				}
			}
		}

		tree.write(sourcePath, sourceFile.getFullText());
	}

	await formatFiles(tree);

	logger.info(
		`
[ngxtension] Conversion completed. Please check the content and run your formatter as needed.
`,
	);
}

export default convertLoadComponentGenerator;
