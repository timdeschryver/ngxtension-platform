import { convertNxGenerator } from '@nx/devkit';
import convertLoadComponentGenerator from './generator';

export default convertNxGenerator(convertLoadComponentGenerator);
